// Code generated by vfsgen; DO NOT EDIT

// +build dist

package assets

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	pathpkg "path"
	"time"
)

// Assets statically implements the virtual filesystem given to vfsgen as input.
var Assets = func() http.FileSystem {
	mustUnmarshalTextTime := func(text string) time.Time {
		var t time.Time
		err := t.UnmarshalText([]byte(text))
		if err != nil {
			panic(err)
		}
		return t
	}

	fs := _vfsgen_fs{
		"/": &_vfsgen_dirInfo{
			name:    "/",
			modTime: mustUnmarshalTextTime("2015-12-11T03:20:31Z"),
		},
		"/changeset.html": &_vfsgen_fileInfo{
			name:    "changeset.html",
			modTime: mustUnmarshalTextTime("2015-12-11T03:20:31Z"),
			content: []byte("\x3c\x73\x63\x72\x69\x70\x74\x20\x69\x67\x6e\x6f\x72\x65\x2d\x63\x73\x70\x3e\x0a\x09\x77\x69\x6e\x64\x6f\x77\x2e\x70\x72\x65\x6c\x6f\x61\x64\x65\x64\x52\x65\x76\x69\x65\x77\x44\x61\x74\x61\x20\x3d\x20\x7b\x7b\x6a\x73\x6f\x6e\x20\x2e\x7d\x7d\x3b\x0a\x3c\x2f\x73\x63\x72\x69\x70\x74\x3e\x0a\x3c\x64\x69\x76\x20\x69\x64\x3d\x22\x43\x6f\x64\x65\x52\x65\x76\x69\x65\x77\x56\x69\x65\x77\x22\x3e\x3c\x2f\x64\x69\x76\x3e\x0a"),
		},
		"/list.html": &_vfsgen_compressedFileInfo{
			name:              "list.html",
			modTime:           mustUnmarshalTextTime("2015-11-25T06:57:49Z"),
			compressedContent: []byte("\x1f\x8b\x08\x00\x00\x09\x6e\x88\x00\xff\xa4\x55\x51\x6e\xdb\x3c\x0c\x7e\x4e\x4e\x21\xe4\xef\xc3\xbf\x07\x3b\x7b\x1e\xdc\x0c\x5d\xfa\xb0\x02\x5d\x57\x74\xed\x01\x14\x9b\x4d\x05\x28\x92\x2b\xc9\x69\x0b\xc3\xc0\x4e\xb1\xdd\x64\x07\xda\x49\x46\x4a\xb2\x63\xa7\xf5\xd2\x62\x41\x0d\xcb\xe5\x47\xf2\x13\x3f\x52\xca\x0a\xb1\x65\xb9\xe4\xd6\x1e\xcf\xf2\x3b\xae\xd6\x60\xc1\x25\x52\x58\x37\x5b\x4c\x27\x59\x25\x9f\x1b\x1d\x5f\x59\xa6\xf8\x96\x1e\xff\x41\xc8\x49\x26\x45\x0b\xad\x6b\x71\xcb\xd2\xaf\x25\xfe\x81\x6a\x1a\x9e\x3b\xb1\x85\xba\x06\x55\x34\x8d\xc7\x4e\x32\xce\xee\x0c\xdc\x12\xf4\x28\xfd\xc4\x2d\xdc\x5c\x9d\x91\x2d\xb3\x25\x57\x6d\x18\x8d\x7e\xb9\x56\x2c\xbe\x93\xb5\x70\x49\x59\x49\x99\x18\xb8\xaf\x80\x08\x66\x73\xc2\x2f\x28\x4d\x36\xe7\x9e\xc5\x5c\x8a\x31\x36\x4b\xa9\x2d\x14\x6f\xe0\xf3\x31\xf7\x1e\xc7\xce\x54\x70\x80\xdb\x63\x47\x26\x64\x19\xd2\xc9\xe6\x95\x5c\x4c\xa7\x94\x26\xfa\xaf\x9c\x62\xf8\x24\x76\xbd\x92\x15\xb0\x5c\x6f\x4a\x6e\x00\x77\xb6\x15\xf0\x30\xeb\xc8\x54\x46\x5e\xeb\x65\x30\xb2\xa3\x74\xe9\x1e\x23\xe3\x83\x85\x8a\x11\x3b\x5a\x6c\x69\x80\x3b\x60\x9c\x29\x78\x60\x9d\x98\xc4\x8d\x13\x35\xdc\xb8\x81\x52\xb3\x0f\xc7\x2c\xbd\xc2\x45\xea\x2b\x40\x9c\x47\x1b\x84\xb4\xc7\x3c\xca\x81\xf2\xcd\x32\xf1\x95\x86\x7b\xf6\xbf\x04\xc5\xd2\x73\x84\xbc\x63\xef\x31\x08\x15\xf8\xc5\x28\xb0\x29\xdd\x53\x6c\xb6\x0b\xcd\x9e\x29\x15\xea\x8f\x4a\x49\x0b\x4d\xa3\x51\xe6\xa8\xda\x6e\x03\x36\xcd\xe6\x18\x3b\xa4\x0f\x38\x9f\x0f\xb9\x49\xf0\xda\xe2\x7a\xa5\x8b\xa7\xb0\x46\x90\x21\xcf\x40\x2f\x60\x3d\xc4\x44\x3b\xad\x8b\x96\xa9\x0f\x92\xe4\x80\x3d\x27\x8a\x59\x87\x18\xd9\xcd\x00\xd2\x6f\xa9\xa0\x62\x8b\x0b\x3a\xb2\xf4\xec\x94\xb4\xfc\xaf\xae\xfd\x2a\x36\x4c\xf4\x6d\xb7\x14\xbf\x5c\x71\x80\x9d\x13\x4e\xc2\x41\x82\xfb\xa8\xd7\x72\x44\x8a\xd7\xe4\xfa\x57\x96\x23\x39\x6d\x09\x79\x3f\xa5\xd3\x6c\x03\x06\x05\xc0\xa0\xa7\x20\x1d\xff\x86\x80\xf4\x33\xf0\x02\xdb\x6e\x8b\xca\x0a\xe5\xf4\xd0\x48\xf3\x18\x8c\x6f\x4b\xcd\x2b\x77\xa7\x4d\x3f\xf9\xea\x89\xed\x46\x30\x98\x13\xc5\x37\xb0\x37\x70\x37\x16\x0c\x4b\x4f\xbc\x3d\x3d\xd7\x6b\xa1\xda\x73\x22\xfe\x42\xa3\x06\x40\xd3\x20\xd9\x21\x36\x36\x69\xaf\xce\xff\x28\xee\xe6\x35\xda\x0e\x40\x91\x62\x18\xa4\x13\xd7\x27\x13\x4d\x5f\x48\x05\x64\xe9\xd5\xe8\x66\xac\x9b\x38\x3f\x65\x75\x4d\x61\x4f\xd6\xfa\xe5\x48\xfd\x81\x8b\x3f\x9a\x51\x28\x06\x8e\xfe\xdc\x79\xee\x39\xa8\xd0\x78\x4d\x70\x6d\xba\xd1\xdd\x39\xe1\xbf\xbb\xa1\xc6\x75\x3b\xec\x1d\x24\x06\x8c\xaf\xa9\xdf\xb2\x46\x51\x2f\xe0\xd1\x5d\xf2\x35\x9e\xef\xe7\x2c\xbd\xc4\xe3\x36\x7e\xa0\x4f\xbf\xae\x25\x47\x21\xb9\x13\x78\x98\xd2\x01\x67\xb4\xb4\x7b\xd7\xe1\x0e\xf1\xe2\xed\xa7\xb4\xdb\x8b\x5f\x08\x4b\x2c\x8b\xee\xde\xe9\x0d\xdf\x10\x39\x5b\xfc\xfe\xf9\x9d\x5a\x66\xec\x32\xf3\xc1\x7b\x3b\x39\x10\x7c\x80\xc4\xe0\x3f\x7e\xf5\x82\x87\xab\x29\xd6\xa9\x2d\xdf\x9f\x00\x00\x00\xff\xff\xd8\xd7\xf8\x75\x15\x08\x00\x00"),
			uncompressedSize:  2069,
		},
	}

	fs["/"].(*_vfsgen_dirInfo).entries = []os.FileInfo{
		fs["/changeset.html"].(os.FileInfo),
		fs["/list.html"].(os.FileInfo),
	}

	return fs
}()

type _vfsgen_fs map[string]interface{}

func (fs _vfsgen_fs) Open(path string) (http.File, error) {
	path = pathpkg.Clean("/" + path)
	f, ok := fs[path]
	if !ok {
		return nil, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}

	switch f := f.(type) {
	case *_vfsgen_compressedFileInfo:
		gr, err := gzip.NewReader(bytes.NewReader(f.compressedContent))
		if err != nil {
			// This should never happen because we generate the gzip bytes such that they are always valid.
			panic("unexpected error reading own gzip compressed bytes: " + err.Error())
		}
		return &_vfsgen_compressedFile{
			_vfsgen_compressedFileInfo: f,
			gr: gr,
		}, nil
	case *_vfsgen_fileInfo:
		return &_vfsgen_file{
			_vfsgen_fileInfo: f,
			Reader:           bytes.NewReader(f.content),
		}, nil
	case *_vfsgen_dirInfo:
		return &_vfsgen_dir{
			_vfsgen_dirInfo: f,
		}, nil
	default:
		// This should never happen because we generate only the above types.
		panic(fmt.Sprintf("unexpected type %T", f))
	}
}

// _vfsgen_compressedFileInfo is a static definition of a gzip compressed file.
type _vfsgen_compressedFileInfo struct {
	name              string
	modTime           time.Time
	compressedContent []byte
	uncompressedSize  int64
}

func (f *_vfsgen_compressedFileInfo) Readdir(count int) ([]os.FileInfo, error) {
	return nil, fmt.Errorf("cannot Readdir from file %s", f.name)
}
func (f *_vfsgen_compressedFileInfo) Stat() (os.FileInfo, error) { return f, nil }

func (f *_vfsgen_compressedFileInfo) GzipBytes() []byte {
	return f.compressedContent
}

func (f *_vfsgen_compressedFileInfo) Name() string       { return f.name }
func (f *_vfsgen_compressedFileInfo) Size() int64        { return f.uncompressedSize }
func (f *_vfsgen_compressedFileInfo) Mode() os.FileMode  { return 0444 }
func (f *_vfsgen_compressedFileInfo) ModTime() time.Time { return f.modTime }
func (f *_vfsgen_compressedFileInfo) IsDir() bool        { return false }
func (f *_vfsgen_compressedFileInfo) Sys() interface{}   { return nil }

// _vfsgen_compressedFile is an opened compressedFile instance.
type _vfsgen_compressedFile struct {
	*_vfsgen_compressedFileInfo
	gr      *gzip.Reader
	grPos   int64 // Actual gr uncompressed position.
	seekPos int64 // Seek uncompressed position.
}

func (f *_vfsgen_compressedFile) Read(p []byte) (n int, err error) {
	if f.grPos > f.seekPos {
		// Rewind to beginning.
		err = f.gr.Reset(bytes.NewReader(f._vfsgen_compressedFileInfo.compressedContent))
		if err != nil {
			return 0, err
		}
		f.grPos = 0
	}
	if f.grPos < f.seekPos {
		// Fast-forward.
		_, err = io.ReadFull(f.gr, make([]byte, f.seekPos-f.grPos))
		if err != nil {
			return 0, err
		}
		f.grPos = f.seekPos
	}
	n, err = f.gr.Read(p)
	f.grPos += int64(n)
	f.seekPos = f.grPos
	return n, err
}
func (f *_vfsgen_compressedFile) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case os.SEEK_SET:
		f.seekPos = 0 + offset
	case os.SEEK_CUR:
		f.seekPos += offset
	case os.SEEK_END:
		f.seekPos = f._vfsgen_compressedFileInfo.uncompressedSize + offset
	}
	return f.seekPos, nil
}
func (f *_vfsgen_compressedFile) Close() error {
	return f.gr.Close()
}

// _vfsgen_fileInfo is a static definition of an uncompressed file (because it's not worth gzip compressing).
type _vfsgen_fileInfo struct {
	name    string
	modTime time.Time
	content []byte
}

func (f *_vfsgen_fileInfo) Readdir(count int) ([]os.FileInfo, error) {
	return nil, fmt.Errorf("cannot Readdir from file %s", f.name)
}
func (f *_vfsgen_fileInfo) Stat() (os.FileInfo, error) { return f, nil }

func (f *_vfsgen_fileInfo) NotWorthGzipCompressing() {}

func (f *_vfsgen_fileInfo) Name() string       { return f.name }
func (f *_vfsgen_fileInfo) Size() int64        { return int64(len(f.content)) }
func (f *_vfsgen_fileInfo) Mode() os.FileMode  { return 0444 }
func (f *_vfsgen_fileInfo) ModTime() time.Time { return f.modTime }
func (f *_vfsgen_fileInfo) IsDir() bool        { return false }
func (f *_vfsgen_fileInfo) Sys() interface{}   { return nil }

// _vfsgen_file is an opened file instance.
type _vfsgen_file struct {
	*_vfsgen_fileInfo
	*bytes.Reader
}

func (f *_vfsgen_file) Close() error {
	return nil
}

// _vfsgen_dirInfo is a static definition of a directory.
type _vfsgen_dirInfo struct {
	name    string
	modTime time.Time
	entries []os.FileInfo
}

func (d *_vfsgen_dirInfo) Read([]byte) (int, error) {
	return 0, fmt.Errorf("cannot Read from directory %s", d.name)
}
func (d *_vfsgen_dirInfo) Close() error               { return nil }
func (d *_vfsgen_dirInfo) Stat() (os.FileInfo, error) { return d, nil }

func (d *_vfsgen_dirInfo) Name() string       { return d.name }
func (d *_vfsgen_dirInfo) Size() int64        { return 0 }
func (d *_vfsgen_dirInfo) Mode() os.FileMode  { return 0755 | os.ModeDir }
func (d *_vfsgen_dirInfo) ModTime() time.Time { return d.modTime }
func (d *_vfsgen_dirInfo) IsDir() bool        { return true }
func (d *_vfsgen_dirInfo) Sys() interface{}   { return nil }

// _vfsgen_dir is an opened dir instance.
type _vfsgen_dir struct {
	*_vfsgen_dirInfo
	pos int // Position within entries for Seek and Readdir.
}

func (d *_vfsgen_dir) Seek(offset int64, whence int) (int64, error) {
	if offset == 0 && whence == os.SEEK_SET {
		d.pos = 0
		return 0, nil
	}
	return 0, fmt.Errorf("unsupported Seek in directory %s", d._vfsgen_dirInfo.name)
}

func (d *_vfsgen_dir) Readdir(count int) ([]os.FileInfo, error) {
	if d.pos >= len(d._vfsgen_dirInfo.entries) && count > 0 {
		return nil, io.EOF
	}
	if count <= 0 || count > len(d._vfsgen_dirInfo.entries)-d.pos {
		count = len(d._vfsgen_dirInfo.entries) - d.pos
	}
	e := d._vfsgen_dirInfo.entries[d.pos : d.pos+count]
	d.pos += count
	return e, nil
}
