1. Make sure pip3 is up to date
>> sudo pip3 install --upgrade pip

2. Install python-osc
>> sudo pip3 install python-osc

3. Test the tcp.py script
>> python3 tcp.py

If you get the error "gaierror: [Errno 8] nodename nor servname provided, or not known", do the following:

1. Copy the name of the computer from one of the terminal input lines (computer_name:current_directory admin$)

2. Open the /etc/hosts file in nano (other text editors will deny permission to modify)
>> sudo nano /etc/hosts

3. Add an alias for 127.0.0.1 to the computer's name:
- arrow down to the line "127.0.0.1 locahost" and insert a new line
- add the line "127.0.0.1 computer_name" (no quotes, pasting the actual computer's name that you got from the terminal)

4. Re-run the tcp.py script
