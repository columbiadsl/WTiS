include("statemachine");

// Main 
// ====
inlets = 1;
outlets = 2;

// Verbosity level (for debugging)
// 1) Print incoming OSC and State changes
// 2) also print possible transitions
// 3) also print conditions (and outcomes) for each transition
// 4) also print changes to condition arrays
// 5) also print condition array histories
// 6) (on compilation) also print states and transitions as they're created
// 	  when the CSV files are parsed
verbose = 3;

// Get a path to the directory containing state machine CSVs
var statemachine_directory = '/sm';	// default
if (jsarguments.length > 1) 
	statemachine_directory = jsarguments[1];

// Create and initialize the state machine 
var sm = StateMachine(statemachine_directory);
sm.init();

// Handler for 'reset' message
function reset() {
	sm.reset();
}

// Handler for 'conditions' message
function conditions() {
	sm.post_conditions();
}

// Handler for all other messages 
// - assumes they are lists consisting of an OSC path and arguments
function anything() {
	sm.handleOSC(messagename, arguments);
}