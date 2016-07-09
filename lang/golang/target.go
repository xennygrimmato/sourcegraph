package golang

func addGoPackageImportPathMeta(meta map[string]string, pkgImportPath string) {
	meta["go_package_import_path"] = pkgImportPath
}

func addGoPackageNameMeta(meta map[string]string, pkgName string) {
	meta["go_package_name"] = pkgName
}
