// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title VEZReceiver - Consumer contract for VEZ CRE workflow
/// @notice Receives reports from KeystoneForwarder and dispatches to VEZproxy / EACAggregatorProxy
/// @dev Implements the IReceiver interface required by KeystoneForwarder
contract VEZReceiver {
    address public immutable forwarder;
    address public immutable vezProxy;
    address public immutable aggregator;

    event ReportReceived(bytes32 instruction, bytes data);

    constructor(address _forwarder, address _vezProxy, address _aggregator) {
        forwarder = _forwarder;
        vezProxy = _vezProxy;
        aggregator = _aggregator;
    }

    /// @notice Called by KeystoneForwarder with the signed report
    /// @param metadata Forwarder metadata (unused here)
    /// @param report Decoded report: (bytes32 instruction, bytes payload)
    function onReport(bytes calldata metadata, bytes calldata report) external {
        require(msg.sender == forwarder, "Only forwarder");

        (bytes32 instruction, bytes memory data) = abi.decode(report, (bytes32, bytes));

        if (instruction == keccak256("mint")) {
            (address to, uint256 amount) = abi.decode(data, (address, uint256));
            (bool success, ) = vezProxy.call(abi.encodeWithSignature("mint(address,uint256)", to, amount));
            require(success, "mint failed");
        } else if (instruction == keccak256("update")) {
            (int256 answer, uint256 timestamp) = abi.decode(data, (int256, uint256));
            (bool success, ) = aggregator.call(abi.encodeWithSignature("updateRoundData(int256,uint256)", answer, timestamp));
            require(success, "update failed");
        } else {
            revert("Unknown instruction");
        }

        emit ReportReceived(instruction, data);
    }
}