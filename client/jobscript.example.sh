#!/bin/bash
echo "Test script running..."
echo "Argument 1 (Operation): $1"
echo "Argument 2 (Job Name): $2"
echo "Current Date: $(date)"

if [ "$1" == "fail" ]; then
  echo "Simulating failure..."
  exit 1
fi

exit 0
