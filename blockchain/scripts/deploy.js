const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const arbiters = [
    deployer.address,
    process.env.ARBITER_2 || deployer.address,
    process.env.ARBITER_3 || deployer.address,
];

  const charity = deployer.address;

  const Contract = await hre.ethers.getContractFactory("WorkoutChallenge");
  const contract = await Contract.deploy(arbiters, charity);

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("WorkoutChallenge deployed to:", address);
  console.log("Save this address for frontend!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});