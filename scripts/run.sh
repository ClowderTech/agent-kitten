#!/usr/bin/env bash
set -o allexport
source .env
set +o allexport
RUST_BACKTRACE=full cargo run
