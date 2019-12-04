/*
 * statemachine.js
 *
 * Finite state machine implementation using classes for States and Transitions. 
 * Includes functions for creating state machines defined in CSV files.
 *
 * Jeff Gregorio, 2019
 */

include("wtis_pathutil");

// ===========================================================================
//
// StateMachine
//
// Class modeling states, transitions, and conditional statements specified 
// in a pair of CSV files. 
// 
// 
//
// ===========================================================================
function StateMachine(smdir) {

	// State machine instance variables
	var obj = {};
	obj.states = {};
	obj.state = [];
	obj.conditions = {};

	// Read state definitions from CSV file
	obj.load_states = function(fname) {

		// Convert CSV to 2D array
		var f = new File(fname);
		f.open();
		cells = csv2array(f.readstring(65536), ',');
		f.close();

		// Iterate row-wise for state specifications
		for (var i = 1; i < cells.length; i++) {
			name = cells[i][0];
			repeats = cells[i][1];
			outlist = cells[i].slice(2);
			outlist = outlist.filter(Boolean);		// Remove empty elements
			if (name !== '' && name != null)		// Ignore empty rows
				obj.states[name] = State(name, repeats, outlist);
		}
	}

	// Read transitions from CSV file
	obj.load_transitions = function(fname) {
		
		// Convert CSV to 2D array
		var f = new File(fname);
		f.open();
		cells = csv2array(f.readstring(65536), ',');
		f.close();

		// Get conditions and value array sizes from first row 
		var ckeys = [];
		var len = 0;
		for (var j = 2; j < cells[0].length; j++) {
			tokens = cells[0][j].split(' ');
			oscpath = tokens[0];
			if (tokens.length === 1) 
				len = 1;
			else if (tokens.length === 2)
				len = tokens[1];
			obj.conditions[oscpath] = new Array(len);
			for (var k = 0; k < len; k++)
				obj.conditions[oscpath][k] = 0;
			ckeys.push(oscpath);
		}
		// Parse remaining rows for transition home states, destinations, and conditions
		for (var row = 1; row < cells.length; row++) {
			homestate = cells[row][0];
			deststate = cells[row][1];
			transcond = cells[row].slice(2);
			if (homestate == '' || homestate == null) 		// Ignore empty rows
				continue;
			if (!obj.states.hasOwnProperty(homestate)) {	// Make sure home state exists
				error("Ignoring transition from undefined state \'" + homestate + "\'\n");
				continue;
			}
			if (!obj.states.hasOwnProperty(deststate)) {	// Make sure dest state exists
				error("Ignoring transition to undefined state \'" + deststate + "\'\n");
				continue;
			}

			cdict = {};	// Initialize a condition dictionary for this transition

			// Add one or multiple AND-ed conditions
			for (var col = 0; col < transcond.length; col++) {

				// Ignore empty conditions
				if (transcond[col] === '' || transcond[col] == null) 
					continue;

				// Tokenize by semicolon; make array of Conditions created from each token
				tokens = transcond[col].split('; ');
				carray = [];
				for (var cond = 0; cond < tokens.length; cond++) {
					carray.push(Condition(obj.states[homestate], ckeys[col], tokens[cond]));
				}

				// Add the condition(s) to the dictionary
				cdict[ckeys[col]] = carray;
			}
			// Create a transition from the condition dictionary and add it to the state
			if (Object.keys(cdict).length !== 0)
				obj.states[homestate].add_transition(deststate, cdict);
			else
				error("Transition \'" + homestate + "\' --> \'" + deststate + "\' has no conditions\n");
		}
	}

	// Printing helpers
	obj.post_states = function() {
		post("STATES:\n");
		for (var key in obj.states)
			post("- " + key + "\n");
	}
	obj.post_conditions = function() {
		post("CONDITIONS:\n");
		for (key in obj.conditions) 
			post("- " + key + ": " + obj.conditions[key] + "\n");
	}

	obj.reset = function() {
		// Reset conditions
		for (key in obj.conditions) {
			for (var i = 0; i < obj.conditions[key].length; i++)
				obj.conditions[key][i] = 0;
		}
		// Clear condition history for each state
		for (key in obj.states) 
			obj.states[key].condhistory = {};
	}

	// Begin state defined in first row of CSV 
	obj.init = function() {
		obj.state = obj.states[Object.keys(obj.states)[0]];
		if (verbose) post(separator);
		obj.state.begin(obj.conditions);
	}

	// Handle incoming OSC messages
	obj.handle_osc = function(path, args) {

		// Make sure the OSC path is relevant
		if (!obj.conditions.hasOwnProperty(path)) {
			error('Unhandled OSC path \'' + path + '\'\n');
			return;
		}
		// Make sure we have an index and a value
		if (args.length < 2) {
			error('Usage: ' + path + ' [index] [value]\n');
			return;
		}
		// Make sure the index is valid
		if (args[0] < 1 || args[0] > obj.conditions[path].length) {
			error('Invalid index ' + args[0] + ' for path \'' + path + '\'\n');
			return;
		}
		if (verbose) {
			post("OSC IN: " + path + ' ' + args[0] + ' ' + args[1] + '\n');
		}

		// Update the current conditions
		obj.conditions[path][args[0]-1] = args[1];

		// Evaluate transitions
		var sdestname = obj.state.update(obj.conditions);

		// Transition to the next state 
		if (sdestname) {
			obj.state = obj.states[sdestname];
			obj.state.begin(obj.conditions);
		}	 	
	}

	// Parse CSV files
	post('Creating state machine from directory \'states.csv\' and \'transitions.csv\' in ' + fullpath(smdir) + '\n');
	obj.load_states(fullpath(smdir) + '/states.csv');
	obj.load_transitions(fullpath(smdir) + '/transitions.csv');

	//
	if (verbose) {
		obj.post_states();
		obj.post_conditions();
	}
	return obj;
}

// ===========================================================================
//
// State
//
// Class representating states, defined by name and array of output messages.
//
// ===========================================================================
function State(name, repeats, outlist) {

	var obj = {};			// This state
	obj.name = name;		// This state's name
	obj.repeats = repeats;	// Whether this state is allowed to repeat
	obj.outlist = outlist;	// Array of this state's output messages (strings)
	obj.condchanges = {};	// Whether conditions have changed on the last update
	obj.condhistory = {};	// History of condition updates
	obj.transitions = [];	// Array of this state's transitions

	if (verbose > 5) {
		post("NEW STATE \'" + obj.name + "\'; repeats = " + repeats + "\n");
		post("- OUTPUTS: \n")
		for (var i = 0; i < obj.outlist.length; i++) {
			post("-- " + obj.outlist[i] + '\n');	
		}
	}	

	// Check condition history for changes
	obj.checkhistory = function(conditions) {

		// Check history for each key
		for (var key in conditions) {

			obj.condchanges[key] = false;

			// If there's no history of this key
			if (!obj.condhistory.hasOwnProperty(key)) {
				obj.condchanges[key] = true;
				continue;
			}

			// Check whether values have changed 
			var histlen = obj.condhistory[key].length;
			var lastvals = obj.condhistory[key][histlen-1];
			for (var i = 0; i < lastvals.length; i++) {
				if (lastvals[i] != conditions[key][i]) {
					obj.condchanges[key] = true;
					break;
				}
			}
		}
	}

	// If condition values have changed, append
	obj.updateflagged = function(conditions) {
		
		if (verbose > 4) 
			post("- HISTORY:\n");

		// For each condition value array
		for (var key in conditions) {

			// If there's no history of this key, create an empty dict entry
			if (!obj.condhistory.hasOwnProperty(key)) 
				obj.condhistory[key] = [];

			// If flagged for changes, add a new row to the condition history
			if (obj.condchanges[key]) {
				obj.condhistory[key].push([]);
				for (var i = 0; i < conditions[key].length; i++) {
					var histlen = obj.condhistory[key].length;
					obj.condhistory[key][histlen-1].push(conditions[key][i]);
				}
			}
			if (verbose > 4) {
				var histlen = obj.condhistory[key].length;
				for (var i = 0; i < histlen; i++) {
					post("-- " + key + "[" + i + "]: " + obj.condhistory[key][i] + '\n');
				}
			}
		}
	}

	// Check the condition history to see if these values have occurred before
	obj.inhistory = function(key, values) {
		if (!obj.condhistory.hasOwnProperty(key))
			return false;
		var found = false;
		var row = 0;
		while (!found && row < obj.condhistory[key].length) {
			var rowvals = obj.condhistory[key][row];
			var rowmatch = true;
			for (var i = 0; i < rowvals.length; i++) {
				if (rowvals[i] != values[i])
					rowmatch = false;
			}
			found = rowmatch;
			row += 1;
		}
		return found;
	}
	
	// Add a transition to the state
	obj.add_transition = function(deststate, cdict) {
		obj.transitions.push(new Transition(obj, deststate, cdict))
	}

	obj.send_actions = function() {
		// Send state actions to left outlet
		for (var i = 0; i < obj.outlist.length; i++) {
			var tokens = obj.outlist[i].split(' ');
			var arr = [];
			for (var j = 0; j < tokens.length; j++) {
				if (isNaN(+tokens[j]))
					arr.push(tokens[j]);
				else
					arr.push(+tokens[j]);
			}
			outlet(0, arr);
		}	
	}

	// Outputs action messages associated with this state
	obj.begin = function(conditions) {
		
		if (verbose) {
			post("BEGIN STATE \'" + obj.name + "\'\n");
			post(separator);
		}
		
		// Send state to right outlet
		outlet(1, obj.name);

		// Add state's initial conditions to the condition history
		obj.checkhistory(conditions);
		obj.updateflagged(conditions);

		if (verbose > 4) 
			post(separator);

		// Send this state's actions
		obj.send_actions();

		// Pass to callback function if it exists
		try {
			eval("begin_" + obj.name + "()");
		}
		catch(err) {
			// No callback
		}
	}

	// State condition handler. Checks if any transition conditions are met and returns
	// destination state name or false.
	obj.update = function(conditions) {

		var dest = false;
		var cb_dest = false;

		// Set object's flags indicating which conditions have changed
		obj.checkhistory(conditions);

		if (verbose > 3) {
			post("- CHANGES:\n")
			var any = false;
			for (key in conditions) {
				if (obj.condchanges[key]) {
					post("-- " + key + ": " + conditions[key] + '\n');
					any = true;
				}
			}
			if (!any)
				post("-- None\n");
		}
		// Check conditions for each transition; return a destination if transitioning
		for (var i = 0; i < obj.transitions.length; i++) {
			if (verbose > 1) 
				post("- TRANSITION \'" + obj.name + "\' --> \'" + obj.transitions[i].dest + '\'\n');
			if (obj.transitions[i].check(conditions))
				dest = obj.transitions[i].dest;
		}
		// Update the history after checking transitions
		obj.updateflagged(conditions);

		// Pass to callback function if it exists
		try {
			cb_dest = eval("update_" + obj.name + "()");
			post("update_" + obj.name + "() returned state " + cb_dest + '\n');
		}
		catch(err) {
			// No callback
			post("no callback update_" + obj.name + "()\n");
		}

		// Allow destination returned by callback to take precedence
		if (cb_dest)
			dest = cb_dest;

		if (verbose)
			post(separator);

		if (dest) {
			// Pass to callback function if it exists
			try {
				eval("end_" + obj.name + "()");
			}
			catch(err) {
				// No callback
			}
		}

		return dest;
	}
	//
	return obj;
}

// ===========================================================================
//
// Transition
//
// State transition class; tests a list of conditions for transition
//
// ===========================================================================
function Transition(state, destname, cdict) {

	var obj = {};
	obj.parentstate = state;
	obj.dest = destname;
	obj.cdict = cdict;

	if (verbose > 5) {
		post("NEW TRANSITION: \'" + obj.parentstate.name + "\' --> \'" + obj.dest + "\'\n");
		for (var key in obj.cdict) {
			for (var i = 0; i < obj.cdict[key].length; i++) {
				post("- " + key + ": ");
				if (obj.cdict[key][i].negate) post("~");
				post(obj.cdict[key][i].type + '\n');
			}
		}
	}

	obj.check = function(cvaldict) {

		var allmet = true;

		for (var key in obj.cdict) {

			var met = true;

			// Make sure the current conditions dict has the array we're testing
			if (!cvaldict.hasOwnProperty(key)) {
				error("Current conditions missing values for " + key + '\n');
				return false;
			}


			var conditions = [];
			if (!Array.isArray(obj.cdict[key]))
				conditions.push(obj.cdict[key]);
			else 
				conditions = obj.cdict[key];


			for (var i = 0; i < conditions.length; i++) {
				
				if (verbose > 2) {
					var neg = ''
					if (conditions[i].negate)
						neg = '~'
					post("-- CONDITION[" + i + "] " + key + " " + neg + conditions[i].type + "...");
				}

				// Evaluate the condition
				cmet = conditions[i].evaluate(cvaldict[key]);					
				if (verbose > 2)
					post(" " + cmet + "\n");

				if (!cmet) 
					met = false;
			}
			if (allmet == true && met == false)
				allmet = false;
		}
		return allmet;
	}
	//
	return obj;
}



// ===========================================================================
//
// Condition([string])
//
// Class for evaluating conditional statements on arrays of values, where
// conditions are defined in a custom string format.
// 
// Valid string values describing conditions include:
// 		ANY 
// 		ALL
// 		SUM #
// 		COUNT #
// 		EQUAL # # ... #
//
// ===========================================================================
function Condition(state, key, cstring) {
	
	// Instance variables
	var obj = {};
	obj.parentstate = state;
	obj.key = key;
	obj.type = '';
	obj.negate = false;
	obj.matchvals = null;

	// Handle negation
	if (cstring[0] === '~') {
		cstring = cstring.slice(1);	// Strip leading '~'
		obj.negate = true;
	}

	// Tokenize
	var tokens = cstring.split(' ');

	// Single token specifications (no arguments)
	if (tokens.length == 1) {
		switch (tokens[0]) {
			case "ANY":
			case "ALL":
			case "CHANGE":
			case "NEW":
				obj.type = tokens[0];
				break;
			default:
				error("Unhandled condition " + tokens[0] + "\n");
				break;
		}
	}
	// Specifications with arguments
	else if (tokens.length > 1) {
		switch (tokens[0]) {
			case "SUM":
			case "COUNT":
				obj.type = tokens[0];
				obj.matchvals = tokens[1];
				break;
			case "EQUAL":
				obj.type = tokens[0];
				obj.matchvals = tokens.slice(1);
				break;
			default:
				error("Unhandled condition " + tokens[0] + "\n");
				break;
		}
	}
	
	// Evaluate whether the condition is met by the current values
	obj.evaluate = function(values) {
		var met = false;
		var val = 0;
		switch (obj.type) {
			case "ANY":
				for (var i = 0; i < values.length; i++) {
					if (values[i] != 0) 
						met = true;
				}
				break;
			case "ALL":
				met = true;
				for (var i = 0; i < values.length; i++) {
					if (values[i] <= 0)
						met = false;
				}
				break;
			case "SUM":
				val = 0;
				for (var i = 0; i < values.length; i++) {
					val += values[i];
				}
				met = val == obj.matchvals;
				break;
			case "COUNT":
				val = 0;
				for (var i = 0; i < values.length; i++) {
					if (values[i] > 0)
						val += 1;
				}
				met = val == obj.matchvals;
				break;
			case "EQUAL":
				if (values.length == obj.matchvals.length) {
					met = true;
					for (var i = 0; i < values.length; i++) {
						if (obj.matchvals[i] == '*')
							continue;
						if (values[i] != obj.matchvals[i])
							met = false;
					}
				}	
				break;
			case "CHANGE":
				met = obj.parentstate.condchanges[obj.key];
				break;
			case "NEW":
				met = !obj.parentstate.inhistory(obj.key, values);
				break;
			default:
				error("No condition to exit current state (invalid condition \'" + obj.type + "'\')\n");
				break;
		}
		return obj.negate ? !met : met;
	}
	// 
	return obj;
}

// CSV parser lifted from Stack Overflow:
// https://stackoverflow.com/questions/1293147/javascript-code-to-parse-csv-data
function csv2array(strData, strDelimiter) {
    // Check to see if the delimiter is defined. If not,
    // then default to comma.
    strDelimiter = (strDelimiter || ",");
    // Create a regular expression to parse the CSV values.
    var objPattern = new RegExp((
            // Delimiters.
            "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
            // Quoted fields.
            "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
            // Standard fields.
            "([^\"\\" + strDelimiter + "\\r\\n]*))"
        ), "gi");
    // Create an array to hold our data. Give the array
    // a default empty first row.
    var arrData = [[]];
    // Create an array to hold our individual pattern
    // matching groups.
    var arrMatches = null;
    // Keep looping over the regular expression matches
    // until we can no longer find a match.
    while (arrMatches = objPattern.exec(strData)) {
        // Get the delimiter that was found.
        var strMatchedDelimiter = arrMatches[1];
        // Check to see if the given delimiter has a length
        // (is not the start of string) and if it matches
        // field delimiter. If id does not, then we know
        // that this delimiter is a row delimiter.
        if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
            // Since we have reached a new row of data,
            // add an empty row to our data array.
            arrData.push([]);
        }
        var strMatchedValue;
        // Now that we have our delimiter out of the way,
        // let's check to see which kind of value we
        // captured (quoted or unquoted).
        if (arrMatches[2]) {
            // We found a quoted value. When we capture
            // this value, unescape any double quotes.
            strMatchedValue = arrMatches[2].replace(new RegExp("\"\"", "g"), "\"");
        } 
        else {
            // We found a non-quoted value.
            strMatchedValue = arrMatches[3];
        }
        // Now that we have our value string, let's add
        // it to the data array.
        arrData[arrData.length - 1].push(strMatchedValue);
    }
    // Return the parsed data.
    return(arrData);
}
