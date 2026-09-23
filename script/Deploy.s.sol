// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {KeystoneForwarder} from "../contracts/KeystoneForwarder.sol";
import {VEZReceiver} from "../contracts/VEZReceiver.sol";

contract Deploy is Script {
    // Slura node pre-deploys proxy / aggregator at fixed addresses
    address internal constant VEZ_PROXY = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address internal constant AGGREGATOR = 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC;

    function run() external {
        vm.startBroadcast();

        address[] memory oracles = new address[](1);
        oracles[0] = vm.envAddress("ORACLE_ADDRESS");

        // 1. Deploy standard Chainlink CRE forwarder (100% conforme au standard)
        KeystoneForwarder forwarder = new KeystoneForwarder(oracles, 1);
        console.log("KeystoneForwarder deployed to:", address(forwarder));

        // 2. Deploy VEZReceiver consumer
        VEZReceiver receiver = new VEZReceiver(address(forwarder), VEZ_PROXY, AGGREGATOR);
        console.log("VEZReceiver deployed to:", address(receiver));

        // 3. Register receiver as consumer on forwarder
        forwarder.registerConsumer(address(receiver), true);
        console.log("VEZReceiver registered as consumer on forwarder");

        vm.stopBroadcast();
    }
}