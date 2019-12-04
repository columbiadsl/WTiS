
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
verbose = 4;

var initialized = false;

// Get a path to the directory containing state machine CSVs
var statemachine_directory = '/sm';	// default
if (jsarguments.length > 1) 
	statemachine_directory = jsarguments[1];

// Create and initialize the state machine 
var sm = StateMachine(statemachine_directory);

// Advance to first state
function init() {
	sm.init();
	initialized = true;
}

// Handler for 'reset' message
function reset() {
	sm.reset();
	init_variables();
}

function replace() {
	force_transition('instruction4');
}

// Handler for 'conditions' message
function conditions() {
	sm.post_conditions();
}

// Handler for all other messages 
// - assumes they are lists consisting of an OSC path and arguments
function anything() {

	if (!initialized) {
		error("Ignoring \'" + messagename + "\'. Initialize first\n");
		return;
	}

	switch (messagename) {
		case '/abbreviate':
			abbreviate = arguments[0] != 0;
			post("abbreviated mode: " + abbreviate + '\n');
			sm.handle_osc(messagename, arguments);
			break;
		// Ignore some of the OSC paths that we might broadcast to the IoT 
		// devices, and some that the devices respond with
		case '/config':
		case '/ping':
		// If we receive /pong from a table while the state machine is running,
		// it presumably has crashed and rebooted, so check if there were any 
		// objects on it and set a tare and offset for the object
		case '/pong':
			if (arguments[0] == 'table') {
				var place = sm.conditions['/placement'];
				var tab_num = arguments[1];
				var obj = place[tab_num-1];
				var revive_arg;
				if (!running) {
					return;
				}
				else if (!activated) {
					revive_arg = 0;
				}
				else if (sent_locks[tab_num-1]) {
					post("Table was locked...\n");
					revive_arg = 3;
					sm.conditions['/lock'][tab_num-1] = 1;
				}
				else if (obj != 0) {
					post("Table was sensing...\n");
					revive_arg = 2;
				}
				else {
					post("Table was active...\n");
					revive_arg = 1;
				}
				post("Reviving table " + tab_num + '\n');
				outlet(0, 'table', tab_num, '/revive', revive_arg);
			}
		case '/reading':
			break;
		default:
			sm.handle_osc(messagename, arguments);
			break;
	}
}

// ============================================================================
// Objects:          // Fragments:
// ========          // ==========
// 1. Phone          // 1. Fire Prevention
// 2. Camera         // 2. House Fire
// 3. Casette        // 3. Night in Montana
// 4. Scanner        // 4. Moving Truck
//                   // 5. Diagnosis
//                   // 6. Hospice
var showmap = {};
showmap[[1, 2, 3, 4]] = [1, 3, 2, 6];
showmap[[1, 2, 4, 3]] = [1, 5, 4, 2];
showmap[[1, 3, 2, 4]] = [1, 2, 3, 6];
showmap[[1, 3, 4, 2]] = [1, 4, 3, 2];
showmap[[1, 4, 2, 3]] = [2, 5, 1, 3];
showmap[[1, 4, 3, 2]] = [2, 6, 4, 1];
showmap[[2, 1, 3, 4]] = [2, 6, 3, 1];
showmap[[2, 1, 4, 3]] = [2, 5, 1, 6];
showmap[[2, 3, 1, 4]] = [2, 6, 1, 4];
showmap[[2, 3, 4, 1]] = [3, 1, 6, 2];
showmap[[2, 4, 1, 3]] = [5, 2, 1, 4];
showmap[[2, 4, 3, 1]] = [3, 1, 5, 4];
showmap[[3, 1, 2, 4]] = [3, 6, 2, 4];
showmap[[3, 1, 4, 2]] = [3, 2, 5, 4];
showmap[[3, 2, 1, 4]] = [3, 4, 2, 6];
showmap[[3, 2, 4, 1]] = [3, 4, 6, 2];
showmap[[3, 4, 1, 2]] = [6, 2, 5, 3];
showmap[[3, 4, 2, 1]] = [4, 6, 1, 3];
showmap[[4, 1, 2, 3]] = [4, 5, 2, 3];
showmap[[4, 1, 3, 2]] = [4, 6, 3, 2];
showmap[[4, 2, 1, 3]] = [4, 3, 2, 5];
showmap[[4, 2, 3, 1]] = [4, 3, 1, 6];
showmap[[4, 3, 1, 2]] = [5, 4, 2, 6];
showmap[[4, 3, 2, 1]] = [5, 3, 1, 6];

var running;			// Show is running
var fragment_seq;		// Show sequence selection (based on first permuatation)
var n_placements;		// How many valid placements made
var n_locks;			// How many panels locked
var sent_locks;  		// Which locks were sent out (don't count on confirmations)
var valid_placements;	// Valid placement history
var missing_objects;	// Objects removed from locked pannels
var activated;			// Whether we've activated the tables
var replacements;		// Whether each object has been put back at end of show
var abbreviate = 0;
init_variables();

function init_variables() {
	running = false;
	fragment_seq = [];
	n_placements = 0;
	n_locks = 0;
	sent_locks = [0, 0, 0, 0];
	valid_placements = [];
	missing_objects = [0, 0, 0, 0];
	activated = false;
	replacements = [0, 0, 0, 0];
	if (abbreviate) 
		sm.conditions['/abbreviate'][0] = 1;	// Abbreviation setting should persist
}

function all_placed(candidate) {
	for (var j = 0; j < candidate.length; j++) {
		if (candidate[j] == 0)
			return false;
	}
	return true;
}

function placement_is_new(candidate) {
	var row;
	var row_equal = true;
	for (var i = 0; i < valid_placements.length; i++) {
		row = valid_placements[i];
		row_equal = true;
		for (var j = 0; j < candidate.length; j++) {
			if (candidate[j] != row[j]) 
				row_equal = false;
		}
		if (row_equal) 
			return false;
	}
	return true;
}

function select_show(perm) {
	fragment_seq = showmap[perm];
}

function force_transition(dest) {
	sm.state = sm.states[dest];
	sm.state.begin(sm.conditions);
}

function lock_table(tab_num, lock_arg) {
	
	// Send lock to tables
	outlet(0, 'table', tab_num, '/lock', lock_arg);
	
	if (lock_arg == 1)
		sent_locks[tab_num-1] = 1;

	// Play lock slides
	n_locks += lock_arg == 1;
	if (lock_arg == 1) {
		if (n_locks < 3) {
			outlet(0, '/locking', tab_num, 1);
		}
		else {
			outlet(0, '/locking', 5, 1);	// Play final lock slide
		}
	}
}

// Find the object that was last on a specified table by checking the
// state history
function last_placement(tab_num) {
	return valid_placements[valid_placements.length-1][tab_num-1];
}

// Check if a missing object was replaced on a locked table and end warning
function check_warn_lock(tab_num) {
	var place = sm.conditions['/placement'];
	if (place[tab_num-1] == 0)
		return false;
	// If we replaced an object, fake the actions of an await state, run its 
	// update method (so we can transition directly to other warnings/placements).
	// If the update method returns false, go to await
	else if (place[tab_num-1] == missing_objects[tab_num-1]) {
		missing_objects[tab_num-1] = 0;
		sm.states['await'].send_actions();
		var await_next = update_await();
		if (await_next)
			return await_next;
		else 
			return 'await';
	}
	return false;
}

function play_object_fragment_for_table(tab_num) {
	var obj_id = last_placement(tab_num);
	outlet(0, '/object', obj_id, 1);
	outlet(0, '/audio/burn/object/voice', obj_id, 1);
	outlet(0, 'table', tab_num, '/led', 0, 128, 255, 30);
}

// ============================================================================

function begin_reset() {
	for (var i = 0; i < 9; i++)
		outlet(0, '/grid', (i+1), 0);
}

function begin_idle() {
	reset();
	running = true;
}

function begin_activate() {
	activated = true;
}

function end_instruction2() {
	outlet(0, '/audio/burn/sfx1', 1, 1);
	outlet(0, '/audio/burn/score1', 1, 1, 1);
	outlet(0, '/audio/burn/score2', 1, 1, 1);
}

function update_await() {

	var place = sm.conditions['/placement'];
	var locks = sm.conditions['/lock'];

	// Ignore repeat objects, as sometimes a heavier object will quickly register
	// as a lighter object on its way to registering its own weight
	for (var i = 0; i < place.length; i++) {
		for (var j = 0; j < place.length; j++) {
			if (i != j && place[i] == place[j] && place[i] != 0) {
				return false;
			}
		}
	}

	// TO DO: Check await --> warn_invalid


	// Check await --> warn_lock
	for (var i = 0; i < place.length; i++) {
		if (locks[i] == 1 && place[i] == 0) {
			return 'warn_lock' + (i+1);
		}
	}

	// Check remain in await
	if (!all_placed(place))
		return false;

	// Check await --> placement
	if (placement_is_new(place)) 
		return 'placement';

	// Otherwise await --> warn_repeat
	else
		return 'warn_repeat'
}

// Lock Warnings
// =============
function begin_warn_lock1() {
	missing_objects[0] = last_placement(1);
}
function begin_warn_lock2() {
	missing_objects[1] = last_placement(2);
}
function begin_warn_lock3() {
	missing_objects[2] = last_placement(3);
}
function begin_warn_lock4() {
	missing_objects[3] = last_placement(4);
}
function update_warn_lock1() {
	return check_warn_lock(1);
}
function update_warn_lock2() {
	return check_warn_lock(2);
}
function update_warn_lock3() {
	return check_warn_lock(3);
}
function update_warn_lock4() {
	return check_warn_lock(4);
}

// Repeat warning
// ==============
function update_warn_repeat() {
	
	var place = sm.conditions['/placement'];
	var locks = sm.conditions['/lock'];

	for (var i = 0; i < place.length; i++) {
		if (place[i] == 0) {
			if (locks[i] == 1)
				return 'warn_lock' + (i+1);
			else
				return 'await';
		}
	}
}

function begin_placement() {

	var place = sm.conditions['/placement'];
	var locks = sm.conditions['/lock'];
	valid_placements.push(place.slice());

	n_placements++;
	if (sm.conditions['/abbreviate'][0] && n_placements == 2) {
		n_placements = 4;
		sm.conditions['/fragment'][fragment_seq[1]-1] = 1;
		sm.conditions['/fragment'][fragment_seq[2]-1] = 1;
		var fakes = 0;
		var idx = 0;
		while (fakes < 2) {
			if (sm.conditions['/locking'][idx] == 0) {
				fakes++;
			}	
			idx++;
		}
	}

	switch (n_placements) {
		case 1:
			select_show(place);
			break;
		case 2:
		case 3:
		case 4:
		default:
			break;
	}

	// Successful placement LED animation
	for (var i = 0; i < locks.length; i++) {
		if (locks[i] == 0) {
			outlet(0, 'table', (i+1), '/led', 0, 200, 0, 60);
		}
	}

	// Play fragment
	var frag_num = fragment_seq[n_placements-1];
	outlet(0, '/fragment', frag_num, 1, 0);
	outlet(0, '/audio/burn/fragment/score', frag_num, 1, 0);
	outlet(0, '/audio/burn/fragment/voice', frag_num, 1, 0);

	// Successful placement LED animation
	for (var i = 0; i < locks.length; i++) {
		if (locks[i] == 0) {
			outlet(0, 'table', (i+1), '/led', 1, 1, 1, 60);
		}
	}
}

// On end of placement state, update the grid images
function end_placement() {
	var frags = sm.conditions['/fragment'];
	if (frags[0] == 1)
		outlet(0, '/grid', 4, 1);
	if (frags[1] == 1)
		outlet(0, '/grid', 2, 1);
	if (frags[2] == 1) 
		outlet(0, '/grid', 6, 1);
	if (frags[3] == 1)
		outlet(0, '/grid', 9, 1);
	if (frags[4] == 1)
		outlet(0, '/grid', 3, 1);
	if (frags[5] == 1) 
		outlet(0, '/grid', 8, 1);
}

function begin_lock() {

	// Reactivate any tables that aren't already locked
	for (var i = 0; i < sm.conditions['/lock'].length; i++) {
		if (sm.conditions['/lock'][i] == 0) 
			outlet(0, 'table', (i+1), '/led', 190, 190, 255, 60);
	}

	var table_nums = [];
	var lock_args = [];

	// Locks
	switch (n_placements) {

		// Lock first table
		case 1:
			table_nums.push(1);
			lock_args.push(1);
			outlet(0, '/timer', 2, 10000);
			break;

		// Figure out which tables can be locked while providing one
		// remaining option for a new permutation on the next round
		case 3:
			var lockables = [];
			var histlen = valid_placements.length;
			var pplace = valid_placements[histlen-1];
			var nplace;
			var temp;

			// A table is lockable if the object on it has never taken the
			// same position in a previous round
			for (var i = 1; i < 4; i++) {
				var can_lock = true;
				for (var j = histlen-2; j >= 0; j--) {
					if (pplace[i] == valid_placements[j][i])
						can_lock = false;
				}
				if (can_lock)
					lockables.push((i+1));
			}

			// Pick randomly from the lockable tables
			var r_idx = Math.floor(Math.random() * lockables.length);
			table_nums.push(lockables[r_idx]);
			lock_args.push(1);
			break;

		case 4:
			post("locking remaining tables\n");
			// Lock remaining unlocked tables
			for (var i = 0; i < sm.conditions['/lock'].length; i++) {
				if (sm.conditions['/lock'][i] == 0) {
					table_nums.push((i+1));
					lock_args.push(1);
				}
			}
			outlet(0, '/timer', 3, 10000);
			break;
		default:
			break;
	}

	for (var i = 0; i < table_nums.length; i++) 
		lock_table(table_nums[i], lock_args[i]);
}

// Check lock state for removals (whether from usable or locked panels)
// before the locked panel slide kicks the state back to await
function update_lock() {

	var place = sm.conditions['/placement'];
	var locks = sm.conditions['/lock'];

	for (var i = 0; i < place.length; i++) {
		if (place[i] == 0) {
			if (locks[i] == 1) {
				if (n_locks < 3) {
					missing_objects[i] = last_placement(i+1);
					post("missing_objects = " + missing_objects + '\n');
					return 'warn_lock' + (i+1);
				}
				sm.states['select'].send_actions();
				return 'select' + (i+1);
			}
			else
				return 'await';
		}
	}
	return false;
}

function end_lock() {
	outlet(0, '/audio/burn/sfx1', 1, 1);
	if (n_placements < 4) {
		outlet(0, '/audio/burn/score1', 1, 1, 1);
		outlet(0, '/audio/burn/score2', 1, 1, 1);
	}
}

function begin_fake_lock() {

	// Reactivate any tables that aren't already locked
	for (var i = 0; i < sm.conditions['/lock'].length; i++) {
		if (sm.conditions['/lock'][i] == 0) 
			outlet(0, 'table', (i+1), '/led', 190, 190, 255, 60);
	}

	// Pick a table to fake lock (randomly)
	var r_idx = Math.floor(Math.random() * 3);
	lock_table(r_idx+2, 2);
}

function end_fake_lock() {
	outlet(0, '/audio/burn/sfx1', 1, 1);
	outlet(0, '/audio/burn/score1', 1, 1, 1);
	outlet(0, '/audio/burn/score2', 1, 1, 1);
}

function begin_select1() {
	play_object_fragment_for_table(1);
}
function begin_select2() {
	play_object_fragment_for_table(2);	
}
function begin_select3() {
	play_object_fragment_for_table(3);
}
function begin_select4() {
	play_object_fragment_for_table(4);
}

function update_instruction4() {
	for (var i = 0; i < replacements.length; i++) {
		if (replacements[i] == 0 && sm.conditions['/retrieval'][i] == 0) {
			replacements[i] = 1;
			outlet(0, '/audio/burn/sfx1', 3);
		}
		else if (replacements[i] == 1 && sm.conditions['/retrieval'][i] == 1) {
			replacements[i] = 0;
			outlet(0, '/audio/burn/sfx1', 2);
		}
	}
}















