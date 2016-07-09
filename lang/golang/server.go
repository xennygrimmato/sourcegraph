package golang

import (
	"log"
	"net"

	"google.golang.org/grpc"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func init() {
	lis, err := net.Listen("tcp", ":0")
	if err != nil {
		log.Fatal("listen for golang server:", err)
	}

	lang.Langs["Go"] = lis.Addr().String()

	s := grpc.NewServer(grpc.CustomCodec(sourcegraph.GRPCCodec))
	lang.RegisterLangServer(s, &langServer{})
	go s.Serve(lis)
}

type langServer struct{}
