#!/bin/sh
# Использование: ./bump.sh 20261126-1  — меняет версию во всех адресах index.html
sed -i -E "s/v=[0-9]{8}-[0-9]+/v=$1/g" index.html
