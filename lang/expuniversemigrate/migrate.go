package expuniversemigrate

import (
	"strings"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/srclib/graph"
)

func ToOldDef(def *lang.Def, repoURI, commitID string) *sourcegraph.Def {
	// TODO(sqs): hacky
	var unitType, unit string
	switch {
	case strings.HasSuffix(def.Path, ".go"):
		unitType = "GoPackage"
		unit = def.Meta["go_package_import_path"]
		if unit == "" {
			unit = repoURI
		}
	case strings.HasSuffix(def.Path, ".js"):
		unitType = "CommonJSPackage"
		unit = def.Meta["javascript_module"]
		if unit == "" {
			unit = "NONE"
		}
	default:
		return nil
		panic("unknown file type: " + def.Path)
	}

	return &sourcegraph.Def{
		Def: graph.Def{
			//Name:     def.Id,
			Name:     def.Title,
			Exported: true,
			DefKey:   graph.DefKey{Repo: repoURI, CommitID: commitID, UnitType: unitType, Unit: unit, Path: def.Id},
			File:     def.Path,
			DefStart: def.Span.StartByte,
			DefEnd:   def.Span.StartByte + def.Span.ByteLen,
			Kind:     "func",
		},
	}
}
