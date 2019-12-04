from pythonosc import udp_client
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import osc_message_builder
import threading
import warnings
import socket

class OSCClient:

	def __init__(self, addr, port):
		self._ip = addr
		self._port = port
		print("OSC: Sending to client %s:%d" % 
			(self._ip, self._port))
		self._client = udp_client.UDPClient(addr, port)
		self._client._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

	def send(self, path, *args):
		builder = osc_message_builder.OscMessageBuilder(path)
		[builder.add_arg(val) for val in args]
		self._client.send(builder.build())
		return

class OSCServer:

	def __init__(self, port, addr=None, default_handler=None):
		self._port = port
		try:
			self._dispat = dispatcher.Dispatcher()
			if addr is None:
				self._server = osc_server.ThreadingOSCUDPServer(
				(socket.gethostbyname(socket.gethostname()), self._port), 
				self._dispat)
			else:
				self._server = osc_server.ThreadingOSCUDPServer(
					(addr, self._port), 
					self._dispat)
		except OSError:
			print("\tServer port %d already in use" % self._port)
		
		if default_handler:
			self._dispat.set_default_handler(default_handler, False)

		return

	def dispatch(self, path, handler, args=None):
		if self._dispat is None:
			print("%s.%s(): No server port specified" % (type(self).__name__, self.serve.__name__ ))
			return
		if not args:
			self._dispat.map(path, handler)
		else:
			self._dispat.map(path, handler, args)
		return

	def serve(self):			
		try:
			threading.Thread(target=self._server.serve_forever, daemon=True).start()
			print("OSC: Serving on %s:%d" % (self._server.server_address))
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

# class OSCController:

# 	def __init__(self, client_addr, client_port, server_port=None):
# 		self._ip_client = client_addr
# 		self._port_c = client_port
# 		self._port_s = server_port
# 		print("Configuring OSC...")
# 		print("\tSending to client at addr %s, port %d" % 
# 			(self._ip_client, self._port_c))
# 		self._client = udp_client.SimpleUDPClient(self._ip_client, self._port_c)
# 		self._dispat = None
# 		if self._port_s is not None:
# 			try:
# 				self._dispat = dispatcher.Dispatcher()
# 				self._server = osc_server.ThreadingOSCUDPServer(
# 					("127.0.0.1", self._port_s), self._dispat)
# 				print("\tServing at addr %s, port %d" % 
# 					(socket.gethostbyname(socket.gethostname()), self._port_s))
# 			except OSError:
# 				warnings.warn("\tServer port %d already in use" % self._port_s)
# 		else:
# 			self._server = None
# 		return
	
# 	def send(self, path, args=None):
# 		try:
# 			self._client.send_message(path, args)
# 		except PermissionError:
# 			return
# 		return

# 	def dispatch(self, path, handler, args=None):
# 		if self._dispat is None:
# 			print("%s.%s(): No server port specified" % (type(self).__name__, self.serve.__name__ ))
# 			return
# 		if not args:
# 			self._dispat.map(path, handler)
# 		else:
# 			self._dispat.map(path, handler, args)
# 		return

# 	def serve(self):			
# 		try:
# 			threading.Thread(target=self._server.serve_forever, daemon=True).start()
# 			print("\tServing on {}".format(self._server.server_address))
# 		except AttributeError:
# 			print("%s.%s(): No server port specified" % (type(self).__name__, self.serve.__name__ ))
# 		return

# 	def shutdown(self):
# 		try:
# 			self._server.shutdown()
# 			self._server.server_close()
# 		except AttributeError:
# 			print("%s.%s(): No server available" % (type(self).__name__, self.shutdown.__name__ ))
# 		return



