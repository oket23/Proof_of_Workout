let provider;
let signer;
let contract;
let userAddress;
let arbiters = [];

const statusMap = ["Active", "Completed", "Failed", "Expired"];


function parseError(error) {
    if (error.code === "ACTION_REJECTED" || error?.message?.includes("user rejected")) {
        return "Ви відхилили транзакцію";
    }
    if (error.code === "INSUFFICIENT_FUNDS" || error?.message?.includes("insufficient funds")) {
        return "Недостатньо ETH (мінімум ~0.001)";
    }
    if (error?.info?.error?.message) return error.info.error.message;
    if (error?.reason) return error.reason;
    if (error?.message) return error.message;
    return "Невідома помилка";
}

// Ініціалізація після завантаження сторінки
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('createBtn').addEventListener('click', createChallenge);
    document.getElementById('approveBtn').addEventListener('click', approve);
    document.getElementById('rejectBtn').addEventListener('click', reject);
    document.getElementById('connectBtn').onclick = connectWallet;
});

// Підключення гаманця
async function connectWallet() {
    if (!window.ethereum) {
        showToast("MetaMask не знайдено!", "error");
        return;
    }

    try {
        provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();
        if (network.chainId !== 11155111n) {
            showToast("Перемкніть MetaMask на мережу Sepolia!", "error");
            return;
        }

        await provider.send("wallet_requestPermissions", [{ eth_accounts: {} }]);
        await provider.send("eth_requestAccounts", []);

        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

        const btn = document.getElementById('connectBtn');
        btn.innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
        btn.onclick = disconnectWallet;

        showToast("Гаманець успішно підключено", "success");

        await checkArbiter();
        await loadChallenges();

        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());

    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
}

// Відключення гаманця
function disconnectWallet() {
    provider = null;
    signer = null;
    contract = null;
    userAddress = null;
    arbiters = [];

    const btn = document.getElementById('connectBtn');
    btn.innerText = 'Connect Wallet';
    btn.disabled = false;
    btn.onclick = connectWallet;

    document.getElementById('arbiterPanel').style.display = 'none';
    document.getElementById('challengesList').innerHTML =
        "<p class='text-muted'>Підключіть гаманець, щоб побачити свої челенджі.</p>";

    showToast("Гаманець відключено", "pending");
}

// Перевірка чи є юзер суддею
async function checkArbiter() {
    try {
        arbiters = await contract.getArbiters();
        const normalizedArbiters = arbiters.map(a => a.toLowerCase());
        if (normalizedArbiters.includes(userAddress.toLowerCase())) {
            document.getElementById('arbiterPanel').style.display = 'block';
            showToast("Ви авторизовані як Арбітр ⚖️", "success");
        }
    } catch (error) {
        console.error("Помилка перевірки арбітра:", error);
    }
}

// Створення челенджу
async function createChallenge() {
    if (!contract) return showToast("Спочатку підключіть гаманець", "error");

    const goal = document.getElementById('goalInput').value;
    const days = document.getElementById('daysInput').value;
    const deposit = document.getElementById('depositInput').value;

    if (!goal || !days || !deposit) return showToast("Заповніть всі поля!", "error");

    try {
        showToast("Підтвердіть транзакцію...", "pending");
        const value = ethers.parseEther(deposit.toString());
        const daysNum = Math.max(1, parseInt(days, 10));

        const tx = await contract.createChallenge(goal, daysNum, { value });
        showToast("Транзакція відправлена. Очікуємо блок...", "pending");
        await tx.wait();

        showToast("Челендж успішно створено!", "success");

        document.getElementById('goalInput').value = '';
        document.getElementById('daysInput').value = '';
        document.getElementById('depositInput').value = '';

        await loadChallenges();
    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
}

// Завантаження челенджів юзера
async function loadChallenges() {
    const listDiv = document.getElementById('challengesList');
    listDiv.innerHTML = "<p class='text-muted'>Завантаження...</p>";

    try {
        const challengeIds = await contract.getUserChallenges(userAddress);

        if (challengeIds.length === 0) {
            listDiv.innerHTML = "<p class='text-muted'>У вас ще немає челенджів.</p>";
            return;
        }

        listDiv.innerHTML = "";
        for (let i = challengeIds.length - 1; i >= 0; i--) {
            const id = challengeIds[i];
            const info = await contract.getChallengeInfo(id);
            renderChallenge(id, info, listDiv);
        }
    } catch (error) {
        console.error(error);
        listDiv.innerHTML = "<p class='text-muted'>Помилка завантаження даних.</p>";
    }
}

// Рендер окремого челенджу
function renderChallenge(id, info, container) {
    const statusNum = Number(info.status);
    const deadlineMs = Number(info.deadline) * 1000;
    const deadlineDate = new Date(deadlineMs).toLocaleString('uk-UA');
    const depositEth = ethers.formatEther(info.deposit);

    const div = document.createElement('div');
    div.className = 'challenge-item';

    let html = `
        <h3>ID: ${id} | ${info.goal}</h3>
        <p><strong>Статус:</strong> <span class="status status-${statusNum}">${statusMap[statusNum]}</span></p>
        <p><strong>Дедлайн:</strong> ${deadlineDate}</p>
        <p><strong>Депозит (залишок):</strong> ${depositEth} ETH</p>
        <p><strong>Голоси (Approve / Reject):</strong> <span style="color:var(--success)">${info.approvals}</span> / <span style="color:var(--error)">${info.rejections}</span></p>
    `;

    if (statusNum === 0) {
        const isExpired = Date.now() > deadlineMs;

        if (isExpired) {
            html += `
                <div class="button-group" style="margin-top: 15px;">
                    <button class="btn-small btn-error" onclick="expireChallenge(${id})" style="width: 100%;">
                        Завершити (Дедлайн минув)
                    </button>
                </div>
            `;
        } else {
            html += `
                <div class="button-group" style="margin-top: 15px;">
                    <input type="text" id="proof-${id}" placeholder="URL доказу (Strava, фото...)" style="margin-bottom:0;">
                    <button class="btn-small" onclick="submitProof(${id})">Відправити доказ</button>
                </div>
            `;
        }
    }

    if (info.proofUrl !== "") {
        html += `<p style="margin-top: 15px;"><strong>Ваш доказ:</strong> <a href="${info.proofUrl}" target="_blank" style="color: var(--primary)">${info.proofUrl}</a></p>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
}

// Відправка доказу
window.submitProof = async function(id) {
    const url = document.getElementById(`proof-${id}`).value;
    if (!url) return showToast("Введіть URL доказу", "error");

    try {
        showToast("Підтвердіть транзакцію...", "pending");
        const tx = await contract.submitProof(id, url);
        showToast("Відправляємо доказ у блокчейн...", "pending");
        await tx.wait();
        showToast("Доказ успішно відправлено!", "success");
        await loadChallenges();
    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
};

window.expireChallenge = async function(id) {
    try {
        showToast("Підтвердіть транзакцію Expire...", "pending");
        const tx = await contract.expireChallenge(id);
        showToast("Завершуємо челендж...", "pending");
        await tx.wait();
        showToast("Челендж переведено в статус Expired!", "success");
        await loadChallenges();
    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
};

// Функції Арбітра
async function approve() {
    const id = document.getElementById('arbiterIdInput').value;
    if (!id) return showToast("Введіть ID", "error");
    try {
        showToast("Підтвердіть Approve...", "pending");
        const tx = await contract.approveChallenge(id);
        await tx.wait();
        showToast("Челендж схвалено!", "success");
        await loadChallenges();
    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
}

async function reject() {
    const id = document.getElementById('arbiterIdInput').value;
    if (!id) return showToast("Введіть ID", "error");
    try {
        showToast("Підтвердіть Reject...", "pending");
        const tx = await contract.rejectChallenge(id);
        await tx.wait();
        showToast("Челендж відхилено!", "success");
        await loadChallenges();
    } catch (error) {
        console.error(error);
        showToast(parseError(error), "error");
    }
}

// Сповіщення (Toasts)
function showToast(message, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';

    if (type === 'error') toast.style.borderLeft = '5px solid var(--error)';
    if (type === 'success') toast.style.borderLeft = '5px solid var(--success)';
    if (type === 'pending') toast.style.borderLeft = '5px solid var(--pending)';

    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}