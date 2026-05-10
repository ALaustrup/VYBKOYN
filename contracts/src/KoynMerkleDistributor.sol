// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title KoynMerkleDistributor
 * @notice Pull KOYN (or any ERC-20 held by this contract) using an OpenZeppelin-standard Merkle leaf:
 *         leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount)))).
 * @dev Cumulative allocation pattern: each leaf sets total entitlement; user receives delta vs already claimed.
 *      Build trees with https://github.com/OpenZeppelin/merkle-tree — matches leaf encoding above.
 */
contract KoynMerkleDistributor is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public merkleRoot;

    mapping(address account => uint256 claimedCumulative) public claimed;

    event MerkleRootUpdated(bytes32 indexed root);
    event Claimed(address indexed account, uint256 amount);

    constructor(address token_, bytes32 merkleRoot_) Ownable(msg.sender) {
        token = IERC20(token_);
        merkleRoot = merkleRoot_;
    }

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
        emit MerkleRootUpdated(root);
    }

    /**
     * @param cumulativeAmount Total KOYN wei the account may claim after this tx (per current tree).
     * @param proof Merkle proof for leaf (account, cumulativeAmount).
     */
    function claim(uint256 cumulativeAmount, bytes32[] calldata proof) external {
        bytes32 leaf =
            keccak256(bytes.concat(keccak256(abi.encode(msg.sender, cumulativeAmount))));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "KoynClaim: invalid proof");

        uint256 prior = claimed[msg.sender];
        require(cumulativeAmount > prior, "KoynClaim: nothing to claim");
        uint256 delta = cumulativeAmount - prior;
        claimed[msg.sender] = cumulativeAmount;

        token.safeTransfer(msg.sender, delta);
        emit Claimed(msg.sender, delta);
    }

    /** Recover stray tokens (owner only). */
    function sweep(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
