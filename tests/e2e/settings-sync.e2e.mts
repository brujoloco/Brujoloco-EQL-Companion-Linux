// settings-sync, OFFLINE (0.2.34): the user is the courier.
//
// The old network e2e (transfer codes against a relay) left with the relay — see
// ~/eql-companion-upstream-archive/settings-sync-network/. What this feature is
// now is four controls on the Sync card: Create transfer, Copy/Save to file on
// the export side, Open transfer file / Read pasted transfer / Apply on the
// import side - and no network anywhere. The unit suites (tests/syncSettings,
// tests/syncCrypto) prove the whole round trip with no Electron in the room;
// what a run against the real app adds is that the card is there and clickable.
//
// Run: `npm run test:e2e -- settings-sync`
