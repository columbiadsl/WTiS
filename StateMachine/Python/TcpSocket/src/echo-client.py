import socket

HOST = '127.0.0.1'
PORT = 7771			# Port used by the (destination) server

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
	s.connect((HOST, PORT))
	# s.sendall(b'Hey now')
	# data = s.recv(1024)

# print('Received', repr(data))