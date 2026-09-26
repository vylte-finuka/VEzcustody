# Chainlink Any API Documentation
Source: https://docs.chain.link/any-api/introduction

> For the complete documentation index, see [llms.txt](/llms.txt).

> **DANGER: Use Chainlink Functions**
>
> The Any API docs remain as a public historical reference for node operators. Please use Chainlink Functions instead.
>
> Chainlink Functions provides your smart contracts access to trust-minimized compute infrastructure, allowing you to fetch data from APIs and perform custom computation. Read the [Chainlink Functions
> documentation](/chainlink-functions) to learn more.

**Connecting to any API** with Chainlink enables your contracts to access to *any* external data source through our decentralized oracle network. We understand making smart contracts compatible with offchain data adds to the complexity of building smart contracts. We created a framework with minimal requirements, yet unbounded flexibility, so developers can focus more on the functionality of smart contracts rather than what feeds them. Chainlink's decentralized oracle network provides smart contracts with the ability to push and pull data, facilitating the interoperability between onchain and offchain applications.

Whether your contract requires sports results, the latest weather, or any other publicly available data, the [Chainlink contract library](https://github.com/smartcontractkit/chainlink/tree/contracts-v1.3.0/contracts) provides the tools required for your contract to consume it.

> **NOTE: Prerequisites**
>
> You should be familiar with the [Chainlink Basic Request Model](/architecture-overview/architecture-request-model). If
> you are new to developing smart contracts on Ethereum, see the [Getting Started](/getting-started/conceptual-overview)
> guide to learn the basics.

> **NOTE: Note on Price Feed Data**
>
> If your smart contracts need access to price feed data, try using [Chainlink Data Feeds](/data-feeds).

### Requesting offchain data

Outlined below are multiple ways developers can connect smart contracts to offchain data feeds. Click a request type to learn more about it:

| Request Type                                                                                | Description                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [HTTP GET Single Word Response](/any-api/get-request/examples/single-word-response)         | This guide explains how to make an HTTP GET request and parse the *json* response to retrieve the value of one single attribute.                                                                                                                                                                                   |
| [HTTP GET Multi-Variable Responses](/any-api/get-request/examples/multi-variable-responses) | This guide explains how to make an HTTP GET request and parse the *json* response to retrieve the values of multiple attributes.                                                                                                                                                                                   |
| [HTTP GET Element in Array Response](/any-api/get-request/examples/array-response)          | This guide explains how to make an HTTP GET request that returns a *json* array and parse it to retrieve the target element's value.                                                                                                                                                                               |
| [HTTP GET Large Responses](/any-api/get-request/examples/large-responses)                   | This guide explains how to make an HTTP Get request that returns a *json* containing an arbitrary-length raw byte data and parse it to return the data as *bytes* data type.                                                                                                                                       |
| [Existing Job Request](/any-api/get-request/examples/existing-job-request)                  | This guide explains how to call a job that leverages [External adapters](/chainlink-nodes/external-adapters/external-adapters) and returns the relevant data to the smart contract. This allows building succinct smart contracts that do not need to comprehend the URL or the response format of the target API. |

### Building external adapters

To learn more about building external adapters and adding them to nodes, refer to the [External Adapters](/chainlink-nodes/external-adapters/external-adapters) documentation.

To understand different use cases for using any API, refer to [Other Tutorials](/getting-started/other-tutorials).