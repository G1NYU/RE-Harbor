use harbor_8spine_native_poc::module_manager::{ModuleManager, repository_import::CatalogFetch};
use std::time::Duration;

#[test]
#[ignore = "explicit external catalog request; separate CI job"]
fn live_catalog_index() {
    const REPOSITORY: &str = "https://8spine-modules.pages.dev/";
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all().build().expect("runtime");
    let result = runtime.block_on(async {
        let mut manager = ModuleManager::default();
        manager.add_repository(REPOSITORY)?;
        let catalog = CatalogFetch::prepare(&manager, REPOSITORY)?
            .fetch_live(&manager).await?;
        if catalog.entries().is_empty() { return Err("empty-catalog"); }
        if manager.modules().count() != 0 { return Err("unexpected-installation"); }
        Ok::<usize, &'static str>(catalog.entries().len())
    });
    // Do not wait indefinitely for an OS DNS lookup that exceeded its deadline.
    runtime.shutdown_timeout(Duration::from_secs(1));
    println!("Live repository installable metadata entries: {}", result.expect("live index retrieval"));
}

#[test]
#[ignore = "explicit external format-only package request; separate CI job"]
fn live_public_package_metadata() {
    // Named, publicly advertised package from the user-supplied index.
    // Fixed identity and URL: an index update cannot redirect this diagnostic
    // to an arbitrary new package. Do not invoke module code or media endpoints.
    const REPOSITORY: &str = "https://8spine-modules.pages.dev/";
    const ID: &str = "soundcloud-direct";
    const DOWNLOAD: &str = "https://8spine-modules.pages.dev/modules/Soundcloud.8spine";
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all().build().expect("runtime");
    let result = runtime.block_on(async {
        let mut manager = ModuleManager::default();
        manager.add_repository(REPOSITORY)?;
        let catalog = CatalogFetch::prepare(&manager, REPOSITORY)?
            .fetch_live(&manager).await?;
        let row = catalog.entries().iter().find(|row| row.key.id == ID)
            .ok_or("catalog-entry-missing")?;
        let key = row.key.clone();
        let fetch = catalog.prepare_package(&manager, &key, DOWNLOAD)?;
        let format = fetch.fetch_and_stage_live(&mut manager).await?;
        let staged = manager.get(&key).ok_or("not-staged")?;
        if staged.enabled() || manager.modules().count() != 1 ||
            staged.fingerprint().len() != 64 || staged.format() != format {
            return Err("unexpected-package-state");
        }
        // Unknown and packed formats are legitimate diagnostic outcomes,
        // not evidence of compatibility. No approval or execution occurs.
        Ok::<_, &'static str>(format)
    });
    runtime.shutdown_timeout(Duration::from_secs(1));
    println!("Public SoundCloud package staged, disabled; format: {:?}", result.expect("public package retrieval"));
}
