# Vyft Product - VEzcustody (Next.js DON)

## Overview
VEzcustody is a custody solution product using Next.js as a server-side Data Oracle Network (DON) for the VEZ stablecoin on Slura (chain 45057).

## Architecture
- `contracts/EACAggregatorProxy.sol` - Oracle PoR autonome (remplace le placeholder 0x555...)
- `src/app/page.tsx` - Dashboard PoR client (viem)
- `src/app/api/mint/route.ts` - Mint signé côté serveur
- `src/app/api/update-round/route.ts` - Mise à jour oracle EAC (sans CRE)
- `src/lib/contracts/abi/` - ABI locaux (VEZproxy, Aggregator)

## Build
```bash
bun run build
```

## Environment
- `SLURA_RPC_URL` - RPC Slura
- `VEZ_PROXY_ADDRESS` - Adresse proxy VEZ
- `EAC_AGGREGATOR_ADDRESS` - Adresse EACAggregatorProxy
- `CUSTODIAN_PRIVATE_KEY` - Clé privée du custodian (serveur uniquement, jamais NEXT_PUBLIC_)

## No Chainlink CRE
The workflow CRE (`@chainlink/cre-sdk`) has been fully removed. All oracle updates are handled directly via viem + wallet server-side.
