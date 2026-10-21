#!/bin/bash
cd "$(dirname "$0")"
if [[ "$(uname -s)" = "Darwin" ]]; then
    open preview.html
else
    echo 'Open preview.html in a browser to view the interactive design demo.'
fi
