# Built-in
import socket
import selectors
import types

# Third-party
from pythonosc import osc_message_builder

# Custom
from util.osc import *

# TCP handlers
def accept_wrapper(sock):
	conn, addr = sock.accept()  
	conn.setblocking(False)
	tcp_selector.register(conn,
		selectors.EVENT_READ | selectors.EVENT_WRITE,
		data=types.SimpleNamespace(addr=addr, inb=b'', outb=b''))
	# data = types.SimpleNamespace(addr=addr, inb=b'', outb=b'')
	# events = selectors.EVENT_READ | selectors.EVENT_WRITE
	# tcp_selector.register(conn, events, data=data)
	print('TCP: accepted connection from', addr)

def service_connection(key, mask):
    sock = key.fileobj
    data = key.data
    if mask & selectors.EVENT_READ:
        recv_data = sock.recv(1024)  # Should be ready to read
        if recv_data:
            data.outb += recv_data	# Does this trigger a write event?
        else:
            print('closing connection to', data.addr)
            tcp_selector.unregister(sock)
            sock.close()
    if mask & selectors.EVENT_WRITE:
        if data.outb:
            print('echoing', repr(data.outb), 'to', data.addr)
            sent = sock.send(data.outb)  # Should be ready to write
            data.outb = data.outb[sent:]

# # TCP handlers
# def accept_wrapper(sock):
# 	conn, addr = sock.accept()  # Should be ready to read
# 	print('accepted connection from', addr)
# 	conn.setblocking(False)
# 	data = types.SimpleNamespace(addr=addr, inb=b'', outb=b'')
# 	events = selectors.EVENT_READ | selectors.EVENT_WRITE
# 	tcp_selector.register(conn, events, data=data)

# def service_connection(key, mask):
#     sock = key.fileobj
#     data = key.data
#     if mask & selectors.EVENT_READ:
#         recv_data = sock.recv(1024)  # Should be ready to read
#         if recv_data:
#             data.outb += recv_data
#         else:
#             print('closing connection to', data.addr)
#             tcp_selector.unregister(sock)
#             sock.close()
#     if mask & selectors.EVENT_WRITE:
#         if data.outb:
#             print('echoing', repr(data.outb), 'to', data.addr)
#             sent = sock.send(data.outb)  # Should be ready to write
#             data.outb = data.outb[sent:]

# UDP Server main handler (only listens for /tcp messages)
def udp_to_tcp_handler(addr, *args):

	if len(args) < 3:
		print("Invalid /tcp message...\n")
		print("	Usage: /tcp [dest_addr] [dest_port] [/oscpath] [arg1] ... [argN]\n")
		return

	# Get the destination TCP client
	dest_addr = args[0]
	dest_port = args[1]
	print("Routing OSC Message: (UDP) %s:%d --> (TCP) %s:%d" % ('localhost', udp_server_port, dest_addr, dest_port))

	# Get the TCP client for this address or create and connect a new client
	try:
		tcp_client = tcp_clients[dest_addr]
	except:
		print("- Creating TCP Client %s:%d" % (dest_addr, dest_port))
		try:
			tcp_client = new_tcp_client(dest_addr, dest_port)
		except:
			print("- Connection failed\n")
			return
	
	# Make an OSC message with the third argument as the path
	builder = osc_message_builder.OscMessageBuilder(args[2])
	if (len(args) > 3):
		[builder.add_arg(val) for val in args[3:]]
	msg = builder.build()

	# Send 
	tcp_client.send(msg.dgram)
	# Do i have to do something here?
	

# Add a new TCP client to the dict
def new_tcp_client(ip_addr, port):
	tcp_clients[ip_addr] = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
	tcp_clients[ip_addr].connect((ip_addr, port))
	return tcp_clients[ip_addr]

# Close all connections to TCP clients
def disconnect():
	for ip_addr in tcp_clients:
		tcp_clients[ip_addr].close()

# TO DO: TCP connection must be initiated by the IoT device clients so we
# 		 can create a dict. entry with the full dest (ip and port). So we need
#		 to create 

iot_port = 7771		# Port used by IoT devices for sending and receiving UDP/TCP
udp_server_port = 9000		# (this) OSC server port, which Max/MSP sends to
local_address = socket.gethostbyname(socket.gethostname())

# OSC server relays UDP messages received from Max/MSP to the IoT devices
# over a reliable TCP connection. Messages must conform to the format indicated
# in the udp_to_tcp_handler function
udp_server = OSCServer(udp_server_port, 'localhost')
udp_server.dispatch('/tcp', udp_to_tcp_handler)
udp_server.serve()

# OSC client relays received TCP messages from IoT devices to Max/MSP via UDP
# we use the IoT port so the Max/MSP patch can receive both from this script 
# and directly from the devices on the same port
osc_client = OSCClient('localhost', iot_port)

# Dictionary of TCP clients, keyed by IP address. Clients are added and connected
# upon receipt of a /tcp message
tcp_clients = {}

# TCP server
tcp_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
tcp_server.bind((local_address, iot_port))
tcp_server.listen()
tcp_server.setblocking(False)
# TCP (client?) selector
tcp_selector = selectors.DefaultSelector()
events = selectors.EVENT_READ | selectors.EVENT_WRITE
tcp_selector.register(tcp_server, events , data=None)
print("TCP: Server listening on %s:%d" % (local_address, iot_port))


try:
	while True:
		# TCP Server
		events = tcp_selector.select(timeout=None)
		for key, mask in events:
			if key.data is None:
				accept_wrapper(key.fileobj)
			else:
				service_connection(key, mask)
		pass
except KeyboardInterrupt:
	print("caught keyboard interrupt, exiting")
finally:
	udp_server.shutdown()
	disconnect()

