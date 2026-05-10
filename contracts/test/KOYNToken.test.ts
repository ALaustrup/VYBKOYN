import { expect } from "chai";
import { ethers } from "hardhat";

describe("KOYNToken", () => {
  it("mints initial supply to treasury and enforces cap", async () => {
    const [deployer, treasury, user] = await ethers.getSigners();
    const initial = ethers.parseEther("1000");
    const cap = ethers.parseEther("2000");
    const KOYN = await ethers.getContractFactory("KOYNToken");
    const token = await KOYN.deploy(initial, treasury.address, cap);
    await token.waitForDeployment();

    expect(await token.balanceOf(treasury.address)).to.equal(initial);
    await token.connect(deployer).mint(user.address, ethers.parseEther("500"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1500"));
    await expect(
      token.connect(deployer).mint(user.address, ethers.parseEther("600"))
    ).to.be.revertedWithCustomError(token, "CapExceeded");
  });
});
