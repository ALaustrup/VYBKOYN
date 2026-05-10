import { expect } from "chai";
import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("KoynMerkleDistributor", () => {
  it("claims cumulative delta against Merkle root", async () => {
    const [treasury, user] = await ethers.getSigners();

    const KOYN = await ethers.getContractFactory("KOYNToken");
    const token = await KOYN.deploy(ethers.parseEther("10000"), treasury.address, ethers.parseEther("100000"));
    await token.waitForDeployment();

    const values = [
      [user.address, ethers.parseEther("100").toString()],
      [treasury.address, ethers.parseEther("1").toString()],
    ];

    const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
    const root = tree.root;

    const Dist = await ethers.getContractFactory("KoynMerkleDistributor");
    const dist = await Dist.deploy(await token.getAddress(), root);
    await dist.waitForDeployment();

    await token.connect(treasury).transfer(await dist.getAddress(), ethers.parseEther("500"));

    const proof = tree.getProof([user.address, ethers.parseEther("100").toString()]);

    await expect(dist.connect(user).claim(ethers.parseEther("100"), proof))
      .to.emit(dist, "Claimed")
      .withArgs(user.address, ethers.parseEther("100"));

    await expect(dist.connect(user).claim(ethers.parseEther("100"), proof)).to.be.revertedWith(
      "KoynClaim: nothing to claim"
    );

    const tree2 = StandardMerkleTree.of(
      [
        [user.address, ethers.parseEther("250").toString()],
        [treasury.address, ethers.parseEther("1").toString()],
      ],
      ["address", "uint256"]
    );
    await dist.connect(treasury).setMerkleRoot(tree2.root);
    const proof2 = tree2.getProof([user.address, ethers.parseEther("250").toString()]);

    await dist.connect(user).claim(ethers.parseEther("250"), proof2);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("250"));
  });
});
