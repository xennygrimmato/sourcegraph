# vscode readme

The [vscode](https://github.com/Microsoft/vscode) repo is copied here
in the `./web_modules/vs` dir.

## Manual update steps

The `vs/css!` import syntax is vscode-specific. To use with our
webpack, run this codemod:

```shell
codemod.py -d web_modules/vs --extensions ts "import 'vs/css!([^']+)';" "import '\1.css';"
```

