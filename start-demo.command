#!/bin/bash
# Double-click on a Mac to start the bank (port 8790) and the two demo shops (8801, 8802). Close the window to stop.
cd "$(dirname "$0")/bank" || exit 1
clear
python3 server.py --lan
