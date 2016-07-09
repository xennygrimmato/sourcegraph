package lang

import (
	"sync"

	"google.golang.org/grpc"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
)

// Langs is inserted into at init time by other packages that define
// Indexers. The map key is the language name from the
// pkg/inventory/filelang package's database. The map value is the
// host:port where the server is running.
var Langs = map[string]string{}

func ClientForLang(lang string) (LangClient, error) {
	addr, ok := Langs[lang]
	if !ok {
		panic("no client registered in Langs for lang " + lang)
	}

	conn, err := getConn(addr)
	if err != nil {
		return nil, err
	}
	return NewLangClient(conn), nil
}

func getConn(addr string) (*grpc.ClientConn, error) {
	connMu.Lock()
	defer connMu.Unlock()

	conn, present := conns[addr]
	if !present {
		var err error
		conn, err = grpc.Dial(addr, grpc.WithInsecure(), grpc.WithCodec(sourcegraph.GRPCCodec))
		if err != nil {
			return nil, err
		}
		conns[addr] = conn
	}
	return conn, nil
}

var (
	connMu sync.Mutex
	conns  = map[string]*grpc.ClientConn{}
)
