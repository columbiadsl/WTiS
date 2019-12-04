from pythonosc import osc_server
from pythonosc import dispatcher
import threading
import warnings
import socket

class UDPClient:

	def __init__(self, addr):
		if addr[0] is None:
			self._addr = (socket.gethostbyname(socket.gethostname()), addr[1])
		else:
			self._addr = addr
		self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
		self._sock.setblocking(0)
		self.print_helper("Created")
		return

	def print_helper(self, description, addr=None, data=None, nl=False):
		print('') if nl else None
		print("UDPClient %15s:%5d:" % self._addr, end=' ')
		print("%12s" % description, end=' ')
		print("%s:%d" % addr, end='') if addr else None
		print("%a" % data, end='') if data else None
		print(' ')
		return

	def send(self, data):
		# self.print_helper("Data out:", data=data)
		self._sock.sendto(data, self._addr)
		return

class OSCServer:

	def __init__(self, addr, default_handler=None):
		if addr[0] is None:
			self._addr = (socket.gethostbyname(socket.gethostname()), addr[1])
		else:
			self._addr = addr
		try:
			self._dispat = dispatcher.Dispatcher()
			self._server = osc_server.ThreadingOSCUDPServer(self._addr, self._dispat)
			self.print_helper("Created")
		except OSError:
			self.print_helper("Port in use")
		if default_handler:
			self._dispat.set_default_handler(default_handler, False)
		return

	def print_helper(self, description, addr=None, data=None):
		print("OSCServer %15s:%5d:" % self._addr, end=' ')
		print("%12s" % description, end=' ')
		print("%s:%d" % addr, end='') if addr else None
		print(":%a" % data, end='') if data else None
		print(' ')
		return

	def dispatch(self, path, handler, args=None):
		if not args:
			self._dispat.map(path, handler)
		else:
			self._dispat.map(path, handler, args)
		return

	def begin(self):			
		try:
			threading.Thread(target=self._server.serve_forever, daemon=True).start()
			self.print_helper("Serving")
		except AttributeError:
			print("%s.%s(): No server port specified" % (type(self).__name__, self.serve.__name__ ))
		return

	def shutdown(self):
		try:
			self._server.shutdown()
			self._server.server_close()
		except AttributeError:
			print("%s.%s(): No server available" % (type(self).__name__, self.shutdown.__name__ ))
		return
