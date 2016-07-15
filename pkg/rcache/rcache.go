package rcache

import (
	"fmt"
	"os"
	"time"

	"github.com/garyburd/redigo/redis"

	"gopkg.in/inconshreveable/log15.v2"

	"sourcegraph.com/sourcegraph/sourcegraph/pkg/conf"
)

const (
	maxClients = 32

	// dataVersion is used for releases that change type struture for
	// data that may already be cached. Increasing this number will
	// change the key prefix that is used for all hash keys,
	// effectively resetting the cache at the same time the new code
	// is deployed.
	dataVersion = "v1"
)

// Cache implements httpcache.Cache
type Cache struct {
	keyPrefix  string
	ttlSeconds int
}

// New creates a redis backed Cache
func New(keyPrefix string, ttlSeconds int) *Cache {
	return &Cache{
		keyPrefix:  keyPrefix,
		ttlSeconds: ttlSeconds,
	}
}

// Get implements httpcache.Cache.Get
func (r *Cache) Get(key string) ([]byte, bool) {
	c := pool.Get()
	defer c.Close()

	b, err := redis.Bytes(c.Do("GET", r.rkey(key)))
	if err != nil && err != redis.ErrNil {
		log15.Warn("failed to execute redis command", "cmd", "GET", "error", err)
	}
	return b, err == nil
}

// Delete implements httpcache.Cache.Set
func (r *Cache) Set(key string, b []byte) {
	c := pool.Get()
	defer c.Close()

	_, err := c.Do("SETEX", r.rkey(key), r.ttlSeconds, b)
	if err != nil {
		log15.Warn("failed to execute redis command", "cmd", "SETEX", "error", err)
	}
}

// Delete implements httpcache.Cache.Delete
func (r *Cache) Delete(key string) {
	c := pool.Get()
	defer c.Close()

	_, err := c.Do("DEL", r.rkey(key))
	if err != nil {
		log15.Warn("failed to execute redis command", "cmd", "DEL", "error", err)
	}
}

// rkey generates the actual key we use on redis.
func (r *Cache) rkey(key string) string {
	return fmt.Sprintf("%s:%s:%s", globalPrefix, r.keyPrefix, key)
}

// ClearAllForTest clears all of the entries with a given prefix. This
// is an O(n) operation and should only be used in tests.
func ClearAllForTest(prefix string) error {
	c := pool.Get()
	defer c.Close()
	_, err := c.Do("EVAL", `local keys = redis.call('keys', ARGV[1])
if #keys > 0 then
	return redis.call('del', unpack(keys))
else
	return ''
end`, 0, fmt.Sprintf("%s:*", fmt.Sprintf("%s:%s", globalPrefix, prefix)))
	return err
}

var (
	pool         *redis.Pool
	globalPrefix string
)

func init() {
	hostname := os.Getenv("SRC_APP_URL")
	if hostname == "" {
		hostname, _ = os.Hostname()
	}
	globalPrefix = fmt.Sprintf("%s:%s", hostname, dataVersion)

	endpoint := conf.GetenvOrDefault("REDIS_MASTER_ENDPOINT", ":6379")

	pool = &redis.Pool{
		MaxIdle:     3,
		IdleTimeout: 240 * time.Second,
		Dial: func() (redis.Conn, error) {
			c, err := redis.Dial("tcp", endpoint)
			if err != nil {
				return nil, err
			}
			return c, err
		},
		TestOnBorrow: func(c redis.Conn, t time.Time) error {
			_, err := c.Do("PING")
			return err
		},
	}
}
