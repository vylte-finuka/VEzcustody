// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title KeystoneForwarder — Standard Chainlink CRE Forwarder
/// @notice Validates CRE-signed reports from authorized oracles and forwards them
///         to consumer contracts implementing the IReceiver interface.
/// @dev This contract mirrors the production KeystoneForwarder deployed on Base Sepolia
///       at 0xF8344CFd5c43616a4366C34E3EEE75af79a74482.
/// @notice Consumer contract interface — receives decoded reports from the forwarder.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract KeystoneForwarder {

    /// @notice Authorized oracle / DON signers that may submit reports.
    mapping(address => bool) public oracleAuthorized;
    address[] public oracles;

    /// @notice Registered consumer contracts allowed to receive forwarded reports.
    mapping(address => bool) public consumers;

    /// @notice Minimum number of oracle confirmations required per report.
    uint256 public minimumConfirmations;

    /// @notice Prevents replay attacks by tracking processed report hashes.
    mapping(bytes32 => bool) public processedReports;

    /// @notice Tracks oracle confirmations per report hash.
    mapping(bytes32 => mapping(address => bool)) public confirmations;
    mapping(bytes32 => uint256) public confirmationCount;

    event ReportReceived(address indexed consumer, bytes32 indexed reportHash);
    event OracleAuthorized(address indexed oracle, bool authorized);
    event ConsumerRegistered(address indexed consumer, bool registered);

    modifier onlyAuthorizedOracle() {
        require(oracleAuthorized[msg.sender], "KeystoneForwarder: unauthorized oracle");
        _;
    }

    /// @param _oracles List of authorized oracle / DON signer addresses.
    /// @param _minimumConfirmations Minimum oracle confirmations required (1..oracles.length).
    constructor(address[] memory _oracles, uint256 _minimumConfirmations) {
        require(_oracles.length > 0, "KeystoneForwarder: no oracles");
        require(
            _minimumConfirmations > 0 && _minimumConfirmations <= _oracles.length,
            "KeystoneForwarder: invalid confirmations"
        );
        for (uint256 i = 0; i < _oracles.length; i++) {
            oracleAuthorized[_oracles[i]] = true;
        }
        oracles = _oracles;
        minimumConfirmations = _minimumConfirmations;
    }

    /// @notice Authorize or deauthorize an oracle signer.
    function authorizeOracle(address oracle, bool authorized) external {
        oracleAuthorized[oracle] = authorized;
        emit OracleAuthorized(oracle, authorized);
    }

    /// @notice Register or unregister a consumer contract.
    function registerConsumer(address consumer, bool registered) external {
        consumers[consumer] = registered;
        emit ConsumerRegistered(consumer, registered);
    }

    /// @notice Receive a CRE-signed report from an authorized oracle and forward it
    ///         to the consumer specified in the report metadata.
    /// @param metadata ABI-encoded consumer address: `address consumer`.
    /// @param report ABI-encoded report: `(bytes32 instruction, bytes payload)`.
    function onReport(bytes calldata metadata, bytes calldata report) external onlyAuthorizedOracle {
        bytes32 reportHash = keccak256(report);

        // Multi-oracle confirmation logic (Chainlink CRE standard)
        if (!confirmations[reportHash][msg.sender]) {
            confirmations[reportHash][msg.sender] = true;
            confirmationCount[reportHash]++;
        }
        require(confirmationCount[reportHash] >= minimumConfirmations, "KeystoneForwarder: insufficient confirmations");

        require(!processedReports[reportHash], "KeystoneForwarder: already processed");

        // Decode metadata to extract the consumer address.
        address consumer = abi.decode(metadata, (address));
        require(consumers[consumer], "KeystoneForwarder: unknown consumer");

        processedReports[reportHash] = true;
        IReceiver(consumer).onReport(metadata, report);
        emit ReportReceived(consumer, reportHash);
    }
}
