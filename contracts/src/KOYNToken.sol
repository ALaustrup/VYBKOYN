// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KOYNToken
 * @notice Gas-efficient ERC-20 on Base-class networks with EIP-2612 permit (enables signatures instead of approvals for integrated flows).
 * @dev Deploy with fixed initial supply minted to `treasury`.
 *      Optional gated `mint` for reward emissions — disable by renouncing ownership or omitting mint in your deployment policy.
 */
contract KOYNToken is ERC20, ERC20Permit, Ownable {
    /// @notice Hard cap — no further inflation once reached (controlled mint path only).
    uint256 public immutable cap;

    error CapExceeded(uint256 attemptedTotal);

    constructor(
        uint256 initialSupply,
        address treasury,
        uint256 cap_
    ) ERC20("Koyn", "KOYN") ERC20Permit("Koyn") Ownable(msg.sender) {
        require(treasury != address(0), "KOYN: zero treasury");
        require(cap_ >= initialSupply, "KOYN: cap below initial");
        cap = cap_;
        _mint(treasury, initialSupply);
    }

    /**
     * @notice Mint new KOYN to `to` until `totalSupply() + amount <= cap`.
     * @dev Restricted to owner (e.g. multisig / timelock). For fixed-supply games, renounce ownership after deploy.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > cap) revert CapExceeded(totalSupply() + amount);
        _mint(to, amount);
    }
}
