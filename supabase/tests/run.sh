#!/bin/sh
# Локальный прогон: создаёт чистую базу, эмулирует Supabase, применяет миграцию, сид и тесты
set -e
cd "$(dirname "$0")"
DB=anuken_transfer_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f supabase_stub.sql -f ../migrations/0001_init.sql -f ../migrations/0002_driver_price.sql -f ../migrations/0003_client_tracking.sql -f ../seed.sql
psql -qtA -v ON_ERROR_STOP=1 -d $DB -f test_flow.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
