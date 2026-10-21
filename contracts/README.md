# Portable Lens contracts

This pack pins language-neutral inputs and fixed expected domain outcomes for the native Treg move. It prepares a port; it does not implement a native importer, run research or establish Python parity.

- [`v1/manifest.json`](v1/manifest.json) declares the behavior version, source revision, operations and seven vector suites.
- [`../src/lib/portable-contracts.test.ts`](../src/lib/portable-contracts.test.ts) runs every vector against the real TypeScript domain functions through a thin projection adapter. Existing `npm test` includes it.
- [`run_python_contracts.py`](run_python_contracts.py) is an optional standard-library harness for a future adapter that calls native Python domain functions. Python is not an application setup requirement.
- [`../docs/PORTABLE-CONTRACTS.md`](../docs/PORTABLE-CONTRACTS.md) defines identity, money, field mapping, limits, preview and migration boundaries.

Run the reference suite from the repository root:

```bash
npm run test:contracts
```

Optional fixture-format verification, with Python 3.12 or later:

```bash
python3 contracts/run_python_contracts.py --validate-only
```

That command explicitly reports `nativeParity: unverified`. To verify an actual native implementation, supply its adapter:

```bash
python3 contracts/run_python_contracts.py --adapter /absolute/path/to/native_lens_contract_adapter.py
```

The adapter must export `evaluate(operation: str, input_data: object) -> object`. It receives no expected output. Bind the operations listed in the manifest to real native functions, then return the documented JSON projections. Unsupported operations must raise `NotImplementedError`; they are failures, never skips. The harness exits 0 only when every selected vector passes, 1 for mismatches/adapter failures, and 2 for configuration/format failures. Calling it without an adapter exits 2. A passing fixture pack is one parity check; team authorization, native billing, database transactions and migration rehearsal still require their own integration tests.

All fixtures are synthetic public-example research. Do not put keys, real private workspace exports or live provider calls in this pack. Keep expected outputs checked in and review changes explicitly; never regenerate expectations from the implementation under test as part of a test run.
