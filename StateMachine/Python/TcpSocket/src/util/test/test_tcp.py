from tcp import *

def tcp_data_handler(data):
	tcp_print_data("Handling data", data)

iot_port = 7771
tcp_server = TCPServer(iot_port)
tcp_server.begin(tcp_data_handler)

try:
	while True:
		tcp_server.loop()
except KeyboardInterrupt:
	dest = '192.168.1.12'
	tcp_print("Attempting to send to", dest, iot_port)
	tcp_server.send('192.168.1.12', b'greetings from TCPServer')


try:
	while True:
		tcp_server.loop()
except KeyboardInterrupt:
	print("\nExiting\n")
finally:
	tcp_server.shutdown()