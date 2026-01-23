#!/usr/bin/env bash
set -o allexport
source .env
set +o allexport
RUST_BACKTRACE=1 cargo run
