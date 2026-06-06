// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WorkoutChallenge {

    enum Status { Active, Completed, Failed, Expired }

    struct Challenge {
        uint256 id;
        address payable owner;
        string goal;
        string proofUrl;
        uint256 deposit;
        uint256 deadline;
        Status status;
        uint8 approvals;
        uint8 rejections;
        mapping(address => bool) hasVoted;
    }

    uint256 public challengeCount;
    address public charityAddress;
    address[3] public arbiters;

    mapping(uint256 => Challenge) public challenges;
    mapping(address => uint256[]) public userChallenges;

    uint256 public constant BONUS_PERCENT = 5;
    uint256 public constant VOTES_NEEDED = 2;

    event ChallengeCreated(uint256 indexed id, address indexed owner, string goal, uint256 deposit, uint256 deadline);
    event ProofSubmitted(uint256 indexed id, string proofUrl);
    event Approved(uint256 indexed id, address arbiter, uint8 approvals);
    event Rejected(uint256 indexed id, address arbiter, uint8 rejections);
    event ChallengeCompleted(uint256 indexed id, address owner, uint256 payout);
    event ChallengeFailed(uint256 indexed id, uint256 burned);

    modifier onlyArbiter() {
        require(
            msg.sender == arbiters[0] ||
            msg.sender == arbiters[1] ||
            msg.sender == arbiters[2],
            "Not an arbiter"
        );
        _;
    }

    modifier onlyOwner(uint256 id) {
        require(challenges[id].owner == msg.sender, "Not challenge owner");
        _;
    }

    modifier challengeExists(uint256 id) {
        require(id < challengeCount, "Challenge not found");
        _;
    }

    constructor(address[3] memory _arbiters, address _charity) {
        arbiters = _arbiters;
        charityAddress = _charity;
    }

    function createChallenge(string calldata _goal, uint256 _durationDays) external payable {
        require(msg.value > 0, "Deposit required");
        require(_durationDays >= 1 && _durationDays <= 90, "Duration: 1-90 days");
        require(bytes(_goal).length > 0, "Goal required");

        uint256 id = challengeCount++;
        Challenge storage c = challenges[id];
        c.id = id;
        c.owner = payable(msg.sender);
        c.goal = _goal;
        c.deposit = msg.value;
        c.deadline = block.timestamp + (_durationDays * 1 days);
        c.status = Status.Active;

        userChallenges[msg.sender].push(id);

        emit ChallengeCreated(id, msg.sender, _goal, msg.value, c.deadline);
    }

    function submitProof(uint256 id, string calldata _proofUrl) external onlyOwner(id) challengeExists(id) {
        Challenge storage c = challenges[id];
        require(c.status == Status.Active, "Challenge not active");
        require(block.timestamp <= c.deadline, "Deadline passed");
        require(bytes(_proofUrl).length > 0, "Proof URL required");

        c.proofUrl = _proofUrl;

        emit ProofSubmitted(id, _proofUrl);
    }

    function approveChallenge(uint256 id) external onlyArbiter challengeExists(id) {
        Challenge storage c = challenges[id];
        require(c.status == Status.Active, "Challenge not active");
        require(bytes(c.proofUrl).length > 0, "No proof submitted");
        require(!c.hasVoted[msg.sender], "Already voted");

        c.hasVoted[msg.sender] = true;
        c.approvals++;

        emit Approved(id, msg.sender, c.approvals);

        if (c.approvals >= VOTES_NEEDED) {
            c.status = Status.Completed;

            uint256 originalDeposit = c.deposit;
            uint256 bonus = (originalDeposit * BONUS_PERCENT) / 100;
            uint256 payout = originalDeposit + bonus;
            c.deposit = 0; 

            if (address(this).balance >= payout) {
                (bool success, ) = c.owner.call{value: payout}("");
                require(success, "Transfer failed");
                emit ChallengeCompleted(id, c.owner, payout);
            } else {
                (bool success, ) = c.owner.call{value: originalDeposit}("");
                require(success, "Transfer failed");
                emit ChallengeCompleted(id, c.owner, originalDeposit);
            }
        }
    }

    function rejectChallenge(uint256 id) external onlyArbiter challengeExists(id) {
        Challenge storage c = challenges[id];
        require(c.status == Status.Active, "Challenge not active");
        require(!c.hasVoted[msg.sender], "Already voted");

        c.hasVoted[msg.sender] = true;
        c.rejections++;

        emit Rejected(id, msg.sender, c.rejections);

        if (c.rejections >= VOTES_NEEDED) {
            c.status = Status.Failed;
            uint256 amount = c.deposit;
            c.deposit = 0;
            
            (bool success, ) = charityAddress.call{value: amount}("");
            require(success, "Transfer to charity failed");
            
            emit ChallengeFailed(id, amount);
        }
    }

    function expireChallenge(uint256 id) external challengeExists(id) {
        Challenge storage c = challenges[id];
        require(c.status == Status.Active, "Not active");
        require(block.timestamp > c.deadline, "Not expired yet");

        c.status = Status.Expired;
        uint256 amount = c.deposit;
        c.deposit = 0;
        
        (bool success, ) = charityAddress.call{value: amount}("");
        require(success, "Transfer to charity failed");
        
        emit ChallengeFailed(id, amount);
    }

    function getChallengeInfo(uint256 id) external view challengeExists(id) returns (
        address owner,
        string memory goal,
        string memory proofUrl,
        uint256 deposit,
        uint256 deadline,
        Status status,
        uint8 approvals,
        uint8 rejections
    ) {
        Challenge storage c = challenges[id];
        return (c.owner, c.goal, c.proofUrl, c.deposit, c.deadline, c.status, c.approvals, c.rejections);
    }

    function getUserChallenges(address user) external view returns (uint256[] memory) {
        return userChallenges[user];
    }

    function getArbiters() external view returns (address[3] memory) {
        return arbiters;
    }

    receive() external payable {}
}