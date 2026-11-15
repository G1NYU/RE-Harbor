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
