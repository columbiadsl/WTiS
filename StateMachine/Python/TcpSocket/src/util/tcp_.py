import threading
import warnings
import socket
import selectors
import types

def tcp_print(description, addr, port):
	print("TCP: %25s: %s:%d" % (description, addr, port))

def tcp_print_data(description, data):
	print("TCP: %25s: %a" % (description, data))

class TCPClient:

	def __init__(self, addr, port):
		self._addr = addr
		self._port = port
		self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self._sock.connect((addr, port))
		tcp_print("New client", self._addr, self._port)
		return

	def send(self, data):
		self._client.send(data)
		tcp_print("Data to", self._addr, self._port)
		tcp_print_data("Data", data)
		return

	def disconnect(self):
		tcp_print("Disconnecting client", self._addr, self._port)
		self._client.close()
		return

class TCPServer:

	def __init__(self, port, addr=None):
		self._port = port
		self._addr = addr
		self._clients = {}
		if self._addr == None:
			self._addr = socket.gethostbyname(socket.gethostname())
		self._data_handler = None
		self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self._sock.bind((self._addr, self._port))
		self._sock.listen()
		self._sock.setblocking(False)
		self._selector = selectors.DefaultSelector()
		self._selector.register(self._sock,
			selectors.EVENT_READ | selectors.EVENT_WRITE,
			data=None)
		tcp_print("Created Server", self._addr, self._port)
		return

	def begin(self, data_handler):
		self._data_handler = data_handler
		# threading.Thread(target=self.loop, daemon=True).start()
		tcp_print("Serving on", self._addr, self._port)
		return

	def loop(self):		
		events = self._selector.select(timeout=None)
		for key, mask in events:
			if key.data is None:
				self.accept(key)
			elif mask & selectors.EVENT_READ:
				self.read(key)
			elif mask & selectors.EVENT_WRITE:
				self.write(key)
		return

	def accept(self, key):
		sock = key.fileobj
		conn, addr = sock.accept() 
		conn.setblocking(False)
		self._selector.register(conn, 
			selectors.EVENT_READ | selectors.EVENT_WRITE,
			data=types.SimpleNamespace(addr=addr, inb=b'', outb=b''))	
		self._clients[addr[0]] = (key, addr)	# Store clients in dict. keyed by IP address
		tcp_print("Connected to", addr[0], addr[1])
		return

	def read(self, key):
		sock = key.fileobj
		addr = sock.getpeername()
		data = sock.recv(1024)
		if data:
			tcp_print("Data from", addr[0], addr[1])
			tcp_print_data("Data", data)
			key.data.outb += data
			self._data_handler(data)	
		else:
			tcp_print("Disconnecting from", addr[0], addr[1])
			self._selector.unregister(sock)
			sock.close()	
		return

	def write(self, key):
		sock = key.fileobj
		data = key.data
		addr = sock.getpeername()
		if data.outb:
			tcp_print("Data to", addr[0], addr[1])
			tcp_print_data("Data", data.outb)
			n_sent = sock.send(data.outb)
			data.outb = data.outb[n_sent:]
		return

	def send(self, ip_addr, data):
		key, addr = self._clients[ip_addr]
		sock = key.fileobj
		print("-- key:")
		print(key)
		print("-- addr:")
		print(addr)
		print("-- sock:")
		print(sock)
		print("-- key.data:")
		print(key.data)

		self._sock.sendto(data, addr)


		# conn, addr = sock.accept() 
		# conn.setblocking(False)
		# print("-- conn:")
		# print(conn)
		# print("-- addr:")
		# print(addr)


		# events = self._selector.select(timeout=None)
		# for key, mask in events:
		# 	print(key)
		# 	if key == self._clients[ip_addr]:
		# 		try:
		# 			key.data.outb += data
		# 			tcp_print_data("Preparing data", data)
		# 		except:
		# 			tcp_print_data("Failed to prepare data", data)
		# 			pass

	def shutdown(self):
		for ip_addr in self._clients:
			sock = self._clients[ip_addr].fileobj
			tcp_print("Shutting down client", ip_addr, 0)
			self._selector.unregister(sock)
			sock.close()
		self._sock.shutdown()
		return
