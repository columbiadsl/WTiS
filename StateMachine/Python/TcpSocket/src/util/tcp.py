import threading
import warnings
import socket
import selectors
import types
import asyncore

from pythonosc import osc_message_builder

from udp import UDPClient, OSCServer

class TCPClient(asyncore.dispatcher_with_send):

	def __init__(self, addr, *args, **kwargs):
		super(TCPClient, self).__init__(*args, **kwargs)
		self._addr = addr
		self._data_handler = None
		return

	def print_helper(self, description, addr=None, data=None, nl=False):
		print('') if nl else None
		print("TCPClient %15s:%5d:" % self._addr, end=' ')
		print("%12s" % description, end=' ')
		print("%s:%d" % addr, end='') if addr else None
		print("%a" % data, end='') if data else None
		print(' ')
		return

	def set_data_handler(self, handler):
		self._data_handler = handler
		return

	def handle_accept(self):
		pair = self.accept()
		if pair is not None:
			sock, addr = pair
			self.print_helper("Accepted", addr=addr)
			return

	def handle_read(self):
		data = self.recv(1024)
		# self.print_helper("Data in:", data=data, nl=True)
		if data and self._data_handler:
			self._data_handler(self, data)
		else:
			self.close()
		return

	def handle_close(self):
		self.print_helper("Disconnected")
		self.close()
		return

	def hendle_error(self):
		self.print_helper("Error")
		self.error()
		return

	def send(self, data):
		self.print_helper("Data out:", data=data)
		super(TCPClient, self).send(data)
		return

class TCPServer(asyncore.dispatcher):

	def __init__(self, addr):
		asyncore.dispatcher.__init__(self)
		if addr[0] is None:
			self._addr = (socket.gethostbyname(socket.gethostname()), addr[1])
		else:
			self._addr = addr
		self._clients = {}
		self.create_socket(socket.AF_INET, socket.SOCK_STREAM)
		self.set_reuse_addr()
		self.bind(self._addr)
		self.print_helper("Created")
		return

	def print_helper(self, description, addr=None):
		print("TCPServer %15s:%5d:" % self._addr, end=' ')
		print("%12s" % description, end=' ')
		print("%s:%d" % addr) if addr else print(' ')
		return

	def begin(self):
		self.listen(5)
		self.print_helper("Serving")
		return

	def set_data_handler(self, handler):
		self._data_handler = handler
		return

	def handle_accept(self):
		pair = self.accept()
		if pair is not None:
			sock, addr = pair
			self.print_helper("Accepted", addr)
			self._clients[addr[0]] = TCPClient(addr, sock)
			self._clients[addr[0]].set_data_handler(self._data_handler)
		return

	def handle_read(self):
		data = self.recv(1024)
		# self.print_helper("Data in:", ("???", 0))
		return

	def handle_close(self):
		self.print_helper("Closing", self._addr)
		self.close()
		return

	def hendle_error(self):
		self.print_helper("Error")
		self.error()
		return

if __name__ == "__main__":

	# UDP Server main handler (only listens for /tcp messages)
	def handle_udp_to_tcp(addr, *args):

		if len(args) < 3:
			print("Invalid /tcp message...\n")
			print("	Usage: /tcp [dest_addr] [dest_port] [/oscpath] [arg1] ... [argN]\n")
			return

		# Get the destination TCP client
		dest_addr = args[0]
		dest_port = args[1]
		
		# Make an OSC message with the third argument as the path
		builder = osc_message_builder.OscMessageBuilder(args[2])
		if (len(args) > 3):
			[builder.add_arg(val) for val in args[3:]]
		msg = builder.build()

		# Retrieve the TCP client with the specified IP and send the message
		try:
			tcp_client = tcp_server._clients[dest_addr]
			print("-- Routing OSC Message: (UDP) %s:%d" % udp_server._addr, end=' ')
			print("--> (TCP) %s:%d" % tcp_client._addr)
			tcp_client.send(msg.dgram)
		except:
			print("\nNo TCP Client %s:%d" % tcp_client._addr)
		return
	

	def handle_tcp_to_udp(tcp_client, data):
		
		# eff = tcp_client._addr + (udp_client._addr, udp_client._port)
		print("-- Routing OSC Message: (TCP) %s:%d" % tcp_client._addr, end=' ')
		print("--> (UDP) %s:%d" % udp_client._addr)
		udp_client.send(data)


	# Ports
	iot_port = 7771				# IoT Device Port
	udp_server_port = 9000

	# Local UDP Client (e.g Max/MSP) --> Local UDP server --> TCP Clients
	udp_server = OSCServer(('localhost', udp_server_port))
	udp_server.dispatch('/tcp', handle_udp_to_tcp)

	# TCP Clients --> TCP Server --> Local UDP Client
	tcp_server = TCPServer((None, iot_port))
	tcp_server.set_data_handler(handle_tcp_to_udp)
	udp_client = UDPClient(('localhost', iot_port))

	# Go
	print('')
	udp_server.begin()
	tcp_server.begin()
	asyncore.loop()

