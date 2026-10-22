# Stable checkpoint before native-map migration

## Baseline

- Tag: `rollback-before-native-map-20261022`
- Application source commit: `db84cc37a087a946304688972a3b1916e6336828`
- OTA: `web-355b8d104e82a90b`
- OTA ZIP SHA-256: `ed52d7594fc194468d716ce8e4b0b47eee323fe1939d01a8359989a04ce9edb7`
- Local checkpoint: `release/share-water-rollback-20261022/`
- Shared API Worker version: `878e8cb9-7882-422e-bbd1-e596ea13d5c6`

The checkpoint retains the original production OTA bytes, expanded web assets, tracked source ZIP,
Git bundle, local Android AAB, and per-file SHA-256 hashes. The source tag is pushed to GitHub.
The local checkpoint directory is intentionally not uploaded to GitHub.
No application deployment or database rollback is performed while creating this checkpoint.

The production OTA above is the final successful GitHub Actions deployment for source `db84cc3`,
not the earlier locally built `web-d76435d017176846`. Build environments can produce different hashes.
Main-branch pushes trigger automatic OTA deployment. Checkpoint documentation is committed with
`[skip ci]` so saving recovery instructions does not replace production. After future releases,
wait for automatic deployment completion and verify its final production manifest/ZIP as well.

## Verify without changing production

```sh
node scripts/rollback-ota.mjs release/share-water-rollback-20261022
```

The checkpoint also contains a standalone copy named `rollback-ota.mjs`.

## Restore the original web OTA (only when rollback is requested)

```sh
node scripts/rollback-ota.mjs release/share-water-rollback-20261022 --apply
```

This verifies all backup files, deploys the saved `ota-dist` directly without rebuilding it,
then verifies the production manifest and downloaded ZIP checksum. Cloudflare CLI login is required.
Installed clients check for the restored manifest on launch/resume. Do not require a monotonically
increasing web version: the current updater also accepts a different saved hash version.

This command is **web-only**: it does not downgrade native SDKs, change the source working tree,
restore/delete database records, or overwrite signing keys.

## Recover source without deleting current work

```sh
git worktree add -b restore-water-20261022 ../share-water-restored rollback-before-native-map-20261022
```

If the repository is lost, clone `source.bundle` into a new directory and check out the baseline tag.
`source.zip` is another copy of tracked files at the baseline commit.
Do not use a destructive reset to recover over uncommitted work.

## Android native rollback

`share-water-v1.9-code10.aab` is the locally available signed AAB (its file is retained and hashed).
It is not proof of which native version is currently installed or live in Play Console.
The original packaged web content can differ from the later OTA baseline saved here.

Once a new native-map shell has been installed, web rollback alone may not restore compatibility.
Restore this baseline source, rebuild the old web-map shell with the **same signing identity** and
a **versionCode higher than the newest distributed versionCode**, and distribute that new AAB.
Google Play does not normally accept publishing the old versionCode again. Do not uninstall the app
as a rollback shortcut, because that can erase locally stored registration/deletion capabilities.
Retain the WebView fallback and capability detection during native-map migration until rollback has
been tested on the new shell. iOS native rollback likewise requires a new compatible signed build.

## Shared API and data

The shared API/D1 is independent of map rendering. Keep user records and device ownership tokens.
Do not restore an old database snapshot when rolling back UI code.
If API code must also be reverted, first inspect its current deployment and schema compatibility,
then use the saved Worker version above or redeploy baseline `community-worker/` code.

Environment files and Android signing secrets are intentionally excluded from the portable source
archive/Git. Keep their existing protected originals; do not rotate or overwrite them for migration.

## Verification boundary

Backup hashes, ZIP integrity, Git bundle recovery metadata, and the verify-only command are checked
when the checkpoint is created. An actual production rollback and native-device downgrade are not
claimed to have been executed. The production app remains on the baseline while this is prepared.
