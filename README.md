
# Proof of Workout (Web3 DApp)

A decentralized application (DApp) deployed on the **Ethereum Sepolia testnet** that motivates users to achieve their fitness goals through financial stakes. Users lock their ETH into a smart contract, submit proof of their workout, and earn their deposit back plus a bonus upon approval by independent arbiters.

## Smart Contract
The contract is successfully deployed on the **Sepolia Testnet**:
**Contract Address:** [`0xC9be207a11E3B15695802c93F641b8c68FB8eae5`](https://sepolia.etherscan.io/address/0xC9be207a11E3B15695802c93F641b8c68FB8eae5)

## Tech Stack

* **Smart Contracts:** Solidity 0.8.20
* **Development Environment:** Hardhat (Toolbox v2)
* **Frontend:** Vanilla JS, HTML5, CSS3 (Dark Theme, Responsive)
* **Web3 Integration:** Ethers.js v6 (via CDN)
* **Blockchain Infrastructure:** Alchemy RPC, Ethereum Sepolia Testnet
* **Testing:** Mocha & Chai (35/35 tests passing with 100% coverage)

## DApp Architecture & Flow

1. **Stake (Create Challenge):** A user connects their MetaMask wallet, sets a fitness goal (e.g., "Run 5km daily"), sets a deadline (1-90 days), and locks a deposit in ETH into the smart contract.
2. **Submit Proof:** Once the workout is complete, the user submits a proof URL (e.g., a Strava activity link or photo evidence) to the blockchain.
3. **Arbiter Review:** A panel of 3 pre-defined Arbiters reviews the proof. The contract requires a quorum of 2 votes (Approve or Reject) to execute the final decision.
4. **Resolution:**
   * **Success:** If approved, the user receives their original deposit + a **5% bonus**.
   * **Failure:** If rejected or if the deadline expires, the user's deposit is irrevocably transferred to a designated **Charity address**.

## ⚙️ Key Features
* **Smart Contract Security:** Implementation of the "Checks-Effects-Interactions" pattern to prevent Reentrancy attacks (deposits are zeroed out before `.transfer()`).
* **Role-Based Access Control:** Custom modifiers (`onlyArbiter`, `onlyOwner`) ensuring strict permission management.
* **Modern Web3 Frontend:** Fully functional UI built without heavy frameworks. Uses `ethers.js v6` for direct blockchain communication.
* **Network Validation:** Frontend automatically checks if the user's wallet is connected to the Sepolia network.
* **Interactive UI:** Toast notification system for pending, successful, and rejected transactions.

## Local Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/)
* MetaMask browser extension
* Testnet ETH on Sepolia (from [Alchemy Faucet](https://sepoliafaucet.com/))
* An [Alchemy](https://www.alchemy.com/) account for the RPC URL

### Steps to Run Locally

1. **Clone the repository:**

```bash
git clone <your-repo-url>
cd Exam
```

2. **Install Dependencies:**
```bash
cd blockchain
npm install
```


3. **Environment Setup:**
Create a `.env` file in the `blockchain/` directory:
```env
SEPOLIA_RPC_URL=[https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY](https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY)
PRIVATE_KEY=your_metamask_private_key_without_0x
```


4. **Compile and Test:**
```bash
npx hardhat compile
npx hardhat test
```


5. **Deploy to Sepolia:**
```bash
npx hardhat run scripts/deploy.js --network sepolia
```


*Save the deployed contract address output in the terminal.*

## Frontend Setup

1. Open `frontend/constants.js`.
2. Update the `CONTRACT_ADDRESS` variable with your newly deployed address.
3. Copy the ABI array from `blockchain/artifacts/contracts/WorkoutChallenge.sol/WorkoutChallenge.json` and paste it into the `ABI` variable.
4. Run `index.html` using **Live Server** (or any local HTTP server) and connect your MetaMask!

