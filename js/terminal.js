$(document).ready(function() {
	
	// Education page text
	var module_results = {
		'year1': 				 " \
				<li>FIRST CLASS HONOURS - 78.3\%</li> \
				<li>-------------------------------------------</li> \
				<li>MODULE RESULTS</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs118/\">Programming for Computer Scientists</a> - 83%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs126/\">Design of Information Structures</a> - 79%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs130/\">Maths for Computer Scientists I</a> - 78\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs131/\">Maths for Computer Scientists II</a> - 62\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs132/\">Computer Organisation & Architecture</a> - 81\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs133/\">Professional Skills</a> - 72\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs134/\">Computer Security</a> - 83\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs139/\">Web Development Technologies</a> - 88\%</li>",
		'year2': " \
				<li>FIRST CLASS HONOURS - 78.7\%</li> \
				<li>-------------------------------------------</li> \
				<li>MODULE RESULTS</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs241/\">Operating Systems and Networks</a> - 83%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs256/\">Functional Programming</a> - 65\% </li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs349/\">Advanced Computer Architecture</a> - 86\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs258/\">Database Systems</a> - 88\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs259/\">Formal Languages</a> - 66\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs260/\">Algorithms</a> - 69\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs261/\">Software Engineering</a> - 74\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs262/\">Logic and Verification</a> - 86\%</li>",
		'year3': " \
				<li>FIRST CLASS HONOURS - 78.3\%</li> \
				<li>-------------------------------------------</li> \
				<li>MODULE RESULTS</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs325/\">Compiler Design</a> - 91%</li> \
				<li>> <a href=\"\">3rd Year Project</a> - 72\% </li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs349/\">Principles of Programming Languages</a> - 93\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs342/\">Machine Learning</a> - 84\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs346/\">Advanced Databases</a> - 66\%</li> \
				<li>> <a target=\"\_blank\" href=\"https://www2.warwick.ac.uk/fac/sci/dcs/teaching/modules/cs313/\">Mobile Robotics</a> - 81\%</li> \
				<li>> <a target=\"\_blank\" href=\"http://www2.warwick.ac.uk/services/aro/dar/quality/modules/ib382/\">Project Management</a> - 67\%</li> \
				<li>> </li>",
		'year4': "TO BE CONFIRMED ...",
		'total': " \
				<li><pre>[========================>        ]</pre></li> \
				<li>CURRENT STATUS - <a class=\"awaiting\">IN PROGRESS (YEAR 4)</a></li> \
				<br> \
				<li>AVERAGE MARK - 78.43%</li> \
				<br> \
				<li>MODULE GRADES:</li> \
				<li>1st - 18</li> \
				<li>2.1 - 5</li> \
				<li>2.2 - 0</li>"
	};
	var alevels = "<p>The Judd School<br><br>A-Levels <br>Maths (A) Chemistry (A*) <br>Physics (A) Economics (B)</p>";
	var gcses= "<p><br><br>GCSEs<br>7A* (Maths, 3 Sciences), 2A <br>(English), 1B (DT)</p>";
	var defaultuniversity = "\
					EDUCATION \
					<p> \
						University of Warwick - Computer Science MEng \
					</p> \
					<ul id=\"year-nav\" class=\"inline-nav\"> \
						<li id=\"year1\" class=\"success\">[YEAR 1]</li> \
						<li id=\"year2\" class=\"success\">[YEAR 2]</li> \
						<li id=\"year3\" class=\"success\">[YEAR 3]</li> \
						<li id=\"year4\" class=\"awaiting\">[YEAR 4]</li> \
						<li id=\"total\" class=\"awaiting active\">[TOTAL]</li> \
					</ul> \
					<ul id=\"module-list\"> \
					" + module_results['total'] +" \
					</ul> ";
	
	
	// global variables for page information
	var current_year = "total";
	var current_tab = "";
	
	// Initialising the nav bar click event
	$('#nav-list > li').click(function() {
		$('#nav-list > li').removeClass('active');
		$(this).addClass('active');
		selected_tab = this.id;
		if (selected_tab == current_tab){
			return;
		}
		current_tab = selected_tab;
		generateFramework(selected_tab, generatePage);
	});
	
	// A function to register the onclick events for the embedded university inline nav
	function register_universityevents(){ 
		$('#year-nav > li').click(
			function() {
				$(this).siblings().removeClass('active');
				$(this).addClass('active');
				
				var selected_year = this.id;
				if (current_year == selected_year) {
					return;
				}
				current_year = selected_year;
				var module_result = module_results[selected_year];
				$('#module-list').html(module_result);
			}
		)
	};
	
	// The div information for generating each pages framework
	var framework = {
		'about' : "",
		'education' : "<div id=\"university\" class=\"terminal-full-column\"></div> \
		<div id=\"alevel\" class=\"terminal-half-column\"></div> \
		<div id=\"gcses\" class=\"terminal-half-column\"> \
		",
		'experience' : "",
		'projects' : "",
		'contact' : ""
	}
	
	// Generates the divs of each page and callbacks on the page generating function
	function generateFramework(tab,callback){
		var test = framework[tab];
		var test2 = document.getElementById("inner-terminal-content").innerHTML;
		document.getElementById("inner-terminal-content").innerHTML = framework[tab];
		callback(tab);
	}
	
	// Generates the page using the typerfunction which simulates typing!
	function generatePage(tab){
		if (tab == "education"){
			typerfunction(defaultuniversity, 'university', 1, register_universityevents)();
			typerfunction(alevels, 'alevel',20)();
			typerfunction(gcses, 'gcses',20)();
		} 
		else if (tab == "experience"){
			
		}
		else if (tab == "projects"){
			
		}
	}
	
	// Generates a typing function with relevant html and div information
	function typerfunction(html, id, delay, callback){
		var i = 0;
		var runbefore = false;
		var isTag = false;
		return function type() {
			if (runbefore) {
				runbefore=false;
				i=0;
			}
			text = html.slice(0, ++i);
			if (text === html) {
				runbefore=true;
				if (callback) callback();
				return;
			}
			
			document.getElementById(id).innerHTML = text;

			var char = text.slice(-1);
			if( char === '<' ) isTag = true;
			if( char === '>' ) isTag = false;

			if (isTag) return type();
			setTimeout(type, delay);
		};
	}
	
});