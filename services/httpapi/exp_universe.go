package httpapi

import (
	"context"
	"io/ioutil"
	"log"
	"net/http"
	"path"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/errcode"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
)

type MonacoLocation struct {
	URI   string       `json:"uri"`
	Range *MonacoRange `json:"range"`
}

type MonacoRange struct {
	Start MonacoPosition `json:"start"`
	End   MonacoPosition `json:"end"`
}

type MonacoPosition struct {
	Line      uint32 `json:"line"`
	Character uint32 `json:"character"`
}

type fullLocation struct {
	Mode      string
	Repo      string
	CommitID  string
	File      string
	Line      uint32
	Character uint32
}

func serveExpUniverseDefinition(w http.ResponseWriter, r *http.Request) error {
	ctx, _ := handlerutil.Client(r)

	var opt fullLocation
	if err := schemaDecoder.Decode(&opt, r.URL.Query()); err != nil {
		return err
	}

	src, err := ioutil.ReadAll(r.Body)
	if err != nil {
		return err
	}

	refs, err := getRefs(ctx, opt, src)
	if err != nil {
		return err
	}
	ref := refs[0]

	var rng *MonacoRange
	if ref.Target.Span != nil {
		rng = &MonacoRange{
			Start: MonacoPosition{Line: ref.Target.Span.StartLine, Character: ref.Target.Span.StartCol},
			End:   MonacoPosition{Line: ref.Target.Span.EndLine, Character: ref.Target.Span.EndCol},
		}
	}

	var uri string
	if ref.Target.Span == nil {
		uri = lang.DefURL(ref.Target, opt.Repo, opt.CommitID)
	} else {
		uri = ref.Target.File
	}

	return writeJSON(w, &MonacoLocation{
		URI:   uri,
		Range: rng,
	})
}

func serveExpUniverseHover(w http.ResponseWriter, r *http.Request) error {
	ctx, _ := handlerutil.Client(r)

	var opt fullLocation
	if err := schemaDecoder.Decode(&opt, r.URL.Query()); err != nil {
		return err
	}

	src, err := ioutil.ReadAll(r.Body)
	if err != nil {
		return err
	}

	refs, err := getRefs(ctx, opt, src)
	if err != nil {
		return err
	}
	ref := refs[0]

	var contents string
	if ref.Target != nil {
		contents = ref.Target.Id
	}

	return writeJSON(w, map[string]interface{}{
		"contents": contents,
		"range": MonacoRange{
			Start: MonacoPosition{Line: ref.Span.StartLine, Character: ref.Span.StartCol},
			End:   MonacoPosition{Line: ref.Span.EndLine, Character: ref.Span.EndCol},
		},
	})
}

func getRefs(ctx context.Context, loc fullLocation, src []byte) ([]*lang.Ref, error) {
	cl, err := lang.ClientForLang(loc.Mode)
	if err != nil {
		return nil, err
	}

	refs, err := cl.Refs(ctx, &lang.RefsOp{
		Sources: map[string][]byte{loc.File: src},
		Origins: []*lang.RefsOp_FileSpan{{File: loc.File, Span: &lang.Span{StartLine: loc.Line + 1, StartCol: loc.Character + 1, EndLine: loc.Line + 1, EndCol: loc.Character + 1}}},
		Config: map[string]string{
			"go_package_import_path": path.Join(loc.Repo, path.Dir(loc.File)),
		},
	})
	if err != nil {
		return nil, err
	}

	if !refs.Complete {
		log.Println("WARNING:", refs.Messages)
	}

	if len(refs.Files) == 0 || len(refs.Files[loc.File].Refs) == 0 {
		return nil, &errcode.HTTPErr{Status: http.StatusNotFound}
	}
	return refs.Files[loc.File].Refs, nil
}
