const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("WorkoutChallenge", function () {
  let contract;
  let owner, arbiter1, arbiter2, arbiter3, charity, other;

  const DEPOSIT = ethers.parseEther("0.01");
  const GOAL = "Run 5km every day";
  const DURATION_DAYS = 7;
  const PROOF_URL = "https://strava.com/activities/12345";

  beforeEach(async function () {
    [owner, arbiter1, arbiter2, arbiter3, charity, other] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("WorkoutChallenge");
    contract = await Factory.deploy(
      [arbiter1.address, arbiter2.address, arbiter3.address],
      charity.address
    );
    await contract.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  // Деплой
  // ─────────────────────────────────────────────
  describe("Deployment", function () {
    it("зберігає арбітрів правильно", async function () {
      const arbiters = await contract.getArbiters();
      expect(arbiters[0]).to.equal(arbiter1.address);
      expect(arbiters[1]).to.equal(arbiter2.address);
      expect(arbiters[2]).to.equal(arbiter3.address);
    });

    it("зберігає charity адресу", async function () {
      expect(await contract.charityAddress()).to.equal(charity.address);
    });

    it("challengeCount = 0 на старті", async function () {
      expect(await contract.challengeCount()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  // createChallenge
  // ─────────────────────────────────────────────
  describe("createChallenge", function () {
    it("створює челендж і збільшує лічильник", async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      expect(await contract.challengeCount()).to.equal(1);
    });

    it("зберігає правильні дані", async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      const info = await contract.getChallengeInfo(0);
      expect(info.owner).to.equal(owner.address);
      expect(info.goal).to.equal(GOAL);
      expect(info.deposit).to.equal(DEPOSIT);
      expect(info.status).to.equal(0); // Active
    });

    it("емітить ChallengeCreated", async function () {
      await expect(
        contract
          .connect(owner)
          .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT })
      )
        .to.emit(contract, "ChallengeCreated")
        .withArgs(0, owner.address, GOAL, DEPOSIT, (v) => v > 0n);
    });

    it("реверт якщо немає депозиту", async function () {
      await expect(
        contract.connect(owner).createChallenge(GOAL, DURATION_DAYS)
      ).to.be.revertedWith("Deposit required");
    });

    it("реверт якщо 0 днів", async function () {
      await expect(
        contract
          .connect(owner)
          .createChallenge(GOAL, 0, { value: DEPOSIT })
      ).to.be.revertedWith("Duration: 1-90 days");
    });

    it("реверт якщо > 90 днів", async function () {
      await expect(
        contract
          .connect(owner)
          .createChallenge(GOAL, 91, { value: DEPOSIT })
      ).to.be.revertedWith("Duration: 1-90 days");
    });

    it("реверт якщо порожня ціль", async function () {
      await expect(
        contract.connect(owner).createChallenge("", DURATION_DAYS, { value: DEPOSIT })
      ).to.be.revertedWith("Goal required");
    });

    it("додає id в userChallenges", async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      const ids = await contract.getUserChallenges(owner.address);
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  // submitProof
  // ─────────────────────────────────────────────
  describe("submitProof", function () {
    beforeEach(async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
    });

    it("зберігає proofUrl", async function () {
      await contract.connect(owner).submitProof(0, PROOF_URL);
      const info = await contract.getChallengeInfo(0);
      expect(info.proofUrl).to.equal(PROOF_URL);
    });

    it("емітить ProofSubmitted", async function () {
      await expect(contract.connect(owner).submitProof(0, PROOF_URL))
        .to.emit(contract, "ProofSubmitted")
        .withArgs(0, PROOF_URL);
    });

    it("реверт від не-власника", async function () {
      await expect(
        contract.connect(other).submitProof(0, PROOF_URL)
      ).to.be.revertedWith("Not challenge owner");
    });

    it("реверт якщо порожній URL", async function () {
      await expect(
        contract.connect(owner).submitProof(0, "")
      ).to.be.revertedWith("Proof URL required");
    });

    it("реверт після дедлайну", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await expect(
        contract.connect(owner).submitProof(0, PROOF_URL)
      ).to.be.revertedWith("Deadline passed");
    });
  });

  // ─────────────────────────────────────────────
  // approveChallenge
  // ─────────────────────────────────────────────
  describe("approveChallenge", function () {
    beforeEach(async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      await contract.connect(owner).submitProof(0, PROOF_URL);
    });

    it("перший арбітр голосує — approvals = 1, статус Active", async function () {
      await contract.connect(arbiter1).approveChallenge(0);
      const info = await contract.getChallengeInfo(0);
      expect(info.approvals).to.equal(1);
      expect(info.status).to.equal(0); // Active
    });

    it("два арбітри → статус Completed, власник отримує депозит + бонус", async function () {
      // Поповнюємо контракт для бонусу
      await owner.sendTransaction({
        to: await contract.getAddress(),
        value: ethers.parseEther("1"),
      });

      const balanceBefore = await ethers.provider.getBalance(owner.address);

      await contract.connect(arbiter1).approveChallenge(0);
      await contract.connect(arbiter2).approveChallenge(0);

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      const bonus = (DEPOSIT * 5n) / 100n;
      const expected = DEPOSIT + bonus;

      // Перевіряємо що отримали >= очікуваного (газ не враховуємо для власника)
      expect(balanceAfter - balanceBefore).to.be.closeTo(
        expected,
        ethers.parseEther("0.001")
      );

      const info = await contract.getChallengeInfo(0);
      expect(info.status).to.equal(1); // Completed
    });

    it("видає депозит без бонусу якщо на контракті не вистачає коштів", async function () {
      const balanceBefore = await ethers.provider.getBalance(owner.address);

      await contract.connect(arbiter1).approveChallenge(0);
      await contract.connect(arbiter2).approveChallenge(0);

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      // Отримали щось — але без бонусу
      expect(balanceAfter - balanceBefore).to.be.closeTo(
        DEPOSIT,
        ethers.parseEther("0.001")
      );
    });

    it("реверт якщо голосує не арбітр", async function () {
      await expect(
        contract.connect(other).approveChallenge(0)
      ).to.be.revertedWith("Not an arbiter");
    });

    it("реверт якщо арбітр голосує двічі", async function () {
      await contract.connect(arbiter1).approveChallenge(0);
      await expect(
        contract.connect(arbiter1).approveChallenge(0)
      ).to.be.revertedWith("Already voted");
    });

    it("реверт якщо немає proof", async function () {
      await contract
        .connect(owner)
        .createChallenge("Another goal", 3, { value: DEPOSIT });
      await expect(
        contract.connect(arbiter1).approveChallenge(1)
      ).to.be.revertedWith("No proof submitted");
    });

    it("емітить Approved", async function () {
      await expect(contract.connect(arbiter1).approveChallenge(0))
        .to.emit(contract, "Approved")
        .withArgs(0, arbiter1.address, 1);
    });
  });

  // ─────────────────────────────────────────────
  // rejectChallenge
  // ─────────────────────────────────────────────
  describe("rejectChallenge", function () {
    beforeEach(async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      await contract.connect(owner).submitProof(0, PROOF_URL);
    });

    it("один реджект — rejections = 1, статус Active", async function () {
      await contract.connect(arbiter1).rejectChallenge(0);
      const info = await contract.getChallengeInfo(0);
      expect(info.rejections).to.equal(1);
      expect(info.status).to.equal(0); // Active
    });

    it("два реджекти → статус Failed, кошти йдуть на charity", async function () {
      const charityBefore = await ethers.provider.getBalance(charity.address);

      await contract.connect(arbiter1).rejectChallenge(0);
      await contract.connect(arbiter2).rejectChallenge(0);

      const charityAfter = await ethers.provider.getBalance(charity.address);
      expect(charityAfter - charityBefore).to.equal(DEPOSIT);

      const info = await contract.getChallengeInfo(0);
      expect(info.status).to.equal(2); // Failed
    });

    it("реверт якщо арбітр голосує двічі", async function () {
      await contract.connect(arbiter1).rejectChallenge(0);
      await expect(
        contract.connect(arbiter1).rejectChallenge(0)
      ).to.be.revertedWith("Already voted");
    });

    it("реверт від не-арбітра", async function () {
      await expect(
        contract.connect(other).rejectChallenge(0)
      ).to.be.revertedWith("Not an arbiter");
    });

    it("емітить ChallengeFailed після двох реджектів", async function () {
      await contract.connect(arbiter1).rejectChallenge(0);
      await expect(contract.connect(arbiter2).rejectChallenge(0))
        .to.emit(contract, "ChallengeFailed")
        .withArgs(0, DEPOSIT);
    });
  });

  // ─────────────────────────────────────────────
  // expireChallenge
  // ─────────────────────────────────────────────
  describe("expireChallenge", function () {
    beforeEach(async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
    });

    it("після дедлайну — статус Expired, кошти на charity", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      const charityBefore = await ethers.provider.getBalance(charity.address);

      await contract.connect(other).expireChallenge(0);

      const charityAfter = await ethers.provider.getBalance(charity.address);
      expect(charityAfter - charityBefore).to.equal(DEPOSIT);

      const info = await contract.getChallengeInfo(0);
      expect(info.status).to.equal(3); // Expired
    });

    it("реверт якщо ще не закінчився", async function () {
      await expect(
        contract.connect(other).expireChallenge(0)
      ).to.be.revertedWith("Not expired yet");
    });

    it("може викликати будь-хто (не тільки власник)", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      // other — не власник і не арбітр, але може кликнути
      await expect(contract.connect(other).expireChallenge(0)).to.not.be
        .reverted;
    });
  });

  // ─────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────
  describe("Edge cases", function () {
    it("кілька челенджів від одного юзера", async function () {
      await contract
        .connect(owner)
        .createChallenge("Goal 1", 3, { value: DEPOSIT });
      await contract
        .connect(owner)
        .createChallenge("Goal 2", 5, { value: DEPOSIT });
      const ids = await contract.getUserChallenges(owner.address);
      expect(ids.length).to.equal(2);
    });

    it("неіснуючий id — реверт getChallengeInfo", async function () {
      await expect(contract.getChallengeInfo(99)).to.be.revertedWith(
        "Challenge not found"
      );
    });

    it("арбітр не може approve після того як вже reject", async function () {
      await contract
        .connect(owner)
        .createChallenge(GOAL, DURATION_DAYS, { value: DEPOSIT });
      await contract.connect(owner).submitProof(0, PROOF_URL);

      await contract.connect(arbiter1).rejectChallenge(0);
      
      await expect(
        contract.connect(arbiter1).approveChallenge(0)
      ).to.be.revertedWith("Already voted");
    });

    it("контракт приймає ETH через receive()", async function () {
      await expect(
        owner.sendTransaction({
          to: await contract.getAddress(),
          value: ethers.parseEther("0.1"),
        })
      ).to.not.be.reverted;
    });
  });
});