# Vendored code

## ts-mls.js

The MLS library the client ships, copied byte for byte from
`web-client-v2/external/ts-mls.js` (generated there by `npm run build:mls`).
`src/utils/mlsCommit.ts` uses it to read group commits.

Keep it identical to the client's copy. The server checks a commit by decoding
the same bytes every client will apply; if the two sides ran different decoders,
any input they read differently would be a way past the check. After updating
the client bundle, copy it here and confirm the hashes match:

```
shasum -a 256 src/vendor/ts-mls.js ../web-client-v2/external/ts-mls.js
```

Do not edit it here.
