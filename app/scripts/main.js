'use strict';

var WorldGeo = function(world, names) {
	this.globe = {type: 'Sphere'};
	this.land = topojson.feature(world, world.objects.land);
	this.countries = this.parseCountries(world, names);
	this.n = this.countries.length;
	this.borders = topojson.mesh(world, world.objects.countries, function(a, b) {
		return a !== b;
	});
	this.projection = d3.geo.orthographic()
								    .clipAngle(90); // Shows full globe
};

WorldGeo.prototype.parseCountries = function(world, names) {
	var countries = topojson.feature(world, world.objects.countries).features;
	var namedCountries = [];
	// Find a name for each country (or discard it if it has none)
	countries.forEach(function(c) {
		var i;
		for (i = 0; i < names.length; i++) {
			if (parseInt(names[i].id) === c.id) {
				c.name = names[i].name;
				namedCountries.push(c);
				break;
			}
		}
	});
	return namedCountries;
};

WorldGeo.prototype.loadViews = function(canvases) {
	var projection = this.projection;
	this.canvases = canvases;
	this.canvases.forEach(function(c) {
		c.path = d3.geo.path()
							 .projection(projection)
							 .context(c.ctx);
		c.width = c.ctx.canvas.width;
		c.height = c.ctx.canvas.height;
	});
};


WorldGeo.prototype.showCountry = function(country) {
	var drawRegion = function(c, region, lineWidth, fill, stroke) {
		c.ctx.strokeStyle = stroke;
		c.ctx.fillStyle = fill;
		c.ctx.lineWidth = lineWidth;
		c.ctx.beginPath();
		c.path(region);
		if (fill) { c.ctx.fill(); }
		if (stroke) { c.ctx.stroke(); }
	};
	var self = this;
	this.canvases.forEach(function(c) {
		var p = d3.geo.centroid(country);
		self.projection.scale(c.height/2 - 5)
									 .rotate([-p[0], -p[1]])
									 .translate([c.height/2, c.height/2]);
		// Zoom in if required
		if (c.zoom) {
			var b = c.path.bounds(country);
	    var w1 = Math.abs(b[1][0]-b[0][0])/c.width;
	    var w2 = Math.abs(b[1][1]-b[0][1])/c.height;
	    self.projection.scale(Math.min(1000, 100/(Math.max(w1, w2))));
		}
    c.ctx.clearRect(0, 0, c.width, c.height);
    drawRegion(c, self.globe, 1, c.zoom ? '#C5EFF7' : '#E4F1FE', '#89C4F4');
    drawRegion(c, self.land, 0.5, '#C8F7C5', '#90C695');
    drawRegion(c, country, 0, '#2ECC71', false);
    drawRegion(c, self.borders, 0.5, false, '#90C695');
	});
};


var App = function(world, names) {
	this.geo = new WorldGeo(world, names);

	this.correctAnswerEl = $(".correct-answer").hide();
	this.incorrectAnswerEl = $(".incorrect-answer").hide();
	this.correctCountryEl = $(".correct-country");

	this.countryInputEl = $("#country_input");

	this.submitCountryEl = $("#submit_country");

	this.countryInputsEl = $("#country_inputs");
	this.nextQuestionEl = $("#next_question").hide();
	this.nextQuestionButtonEl = $("#next_question_button");

	this.currentQuestionEl = $(".current-question");
	this.totalQuestionsEl = $(".total-questions");
	this.progressIndicatorEl = $(".progress-indicator");

	this.quizPage = $("#quiz_page");
	this.statsPage = $("#stats_page");
	this.menuPage = $("#menu_page");
	this.homeButton = $(".home-button");

	this.randomQuizButton = $("#random_quiz");
	this.viewStatsButton = $("#view_stats");
	this.swotUpButton = $("#swot_up");

	this.statsList = $("#stats_list");

	this.init();
};

App.prototype.init = function() {
	var bigCanvas = d3.select(".worldmap")
										.append("canvas")
										.attr("width", 320)
										.attr("height", 320);
	var smallCanvas = d3.select(".worldmap-inset")
											.append("canvas")
											.attr("width", 100)
											.attr("height", 100);

	this.geo.loadViews([{
		ctx: bigCanvas.node().getContext("2d"),
		zoom: true
	}, {
		ctx: smallCanvas.node().getContext("2d")
	}]);

	/* localStorage */
	if (localStorage.totalQuizzes) {
		this.totalQuizzes = parseInt(localStorage.totalQuizzes);
	} else {
		this.totalQuizzes = 0;
	}

	var self = this;

	/* Autocomplete */
	var suggestions = [];
	this.geo.countries.forEach(function(c) {
		suggestions.push({value: c.name, data: c.name});
	});
	this.countryInputEl.autocomplete({
		lookup: suggestions,
		lookupLimit: 4,
		orientation: 'top',
		onSelect: function(s) {
			self.countryInputEl.text(s.data);
		}
	});
	

	/* Register event listeners */
	this.submitCountryEl.on("click", function() {
		self.checkAnswer();
	});
	this.nextQuestionButtonEl.on("click", function() {
		self.showNextQuizQuestion();
	});
	this.randomQuizButton.on("click", function() {
		self.startQuiz(self.randomQuestions(20));
	});
	this.viewStatsButton.on("click", function() {
		self.showStats();
	});
	this.homeButton.on("click", function() {
		if (self.questions) {
			self.saveQuizResults();
			self.questions = null; // cancel current quiz if any
		}
		self.showMainMenu();
	});
	this.swotUpButton.on("click", function() {
		self.startQuiz(self.swotUpQuestions(20));
	});

	this.showMainMenu();


};

App.prototype.swotUpQuestions = function(n) {
	var shuffled = d3.shuffle(this.geo.countries);
	var stats;
	if (localStorage.stats) {
		stats = JSON.parse(localStorage.stats);
	} else {
		stats = {};
	}
	var compareCountries = function(a, b) {
		var a0 = stats[a.name] ? stats[a.name].lastCorrect : -2;
		var b0 = stats[b.name] ? stats[b.name].lastCorrect : -2;
		return a0 - b0;
	};
	shuffled.sort(compareCountries);
	return shuffled.slice(0, n);
};

App.prototype.saveQuizResults = function() {
	if (!$.isEmptyObject(this.results)) {
		var stats;
		if (localStorage.stats) {
			stats = JSON.parse(localStorage.stats);
		} else {
			stats = {};
		}
		for (var c in this.results) {
			if (this.results.hasOwnProperty(c)) {
				if (!stats[c]) {
					stats[c] = {correct: 0, total: 0, lastCorrect: -1};
				}
				if (this.results[c]) {
					stats[c].correct++;
					stats[c].lastCorrect = this.totalQuizzes;
				}
				stats[c].total++;
			}
		}
		this.totalQuizzes++;
		localStorage.totalQuizzes = JSON.stringify(this.totalQuizzes);
		localStorage.stats = JSON.stringify(stats);
	}
};

App.prototype.showMainMenu = function() {
	if (!localStorage.stats) {
		this.viewStatsButton.prop("disabled", true);
	} else {
		this.viewStatsButton.prop("disabled", false);
	}
	this.quizPage.addClass("hidden-page");
	this.statsPage.addClass("hidden-page");
	this.menuPage.removeClass("hidden-page");
};

App.prototype.showStats = function() {
	var stats = JSON.parse(localStorage.stats);
	this.statsList.empty();

	var stylePercentBG = function(p) {
		return "linear-gradient(to right, #26A65B " + p + "%, #C0392B " + p + "%)";
	};

	var li;
	for (var name in stats) {
		if (stats.hasOwnProperty(name)) {
			li = $("<li></li>").text(name + " - " + stats[name].correct + "/" + stats[name].total);
			li.css("background", stylePercentBG(100*stats[name].correct/stats[name].total));
			this.statsList.append(li);
		}
	}

	this.statsPage.removeClass("hidden-page");
	this.menuPage.addClass("hidden-page");
};

App.prototype.randomQuestions = function(n) {
	var shuffled = d3.shuffle(this.geo.countries);
	return shuffled.slice(0, n);
};

App.prototype.startQuiz = function(questions) {
	this.questions = questions;
	this.currentQuestion = 0;
	this.totalCorrect = 0;
	this.results = {};

	this.totalQuestionsEl.text(questions.length);

	this.quizPage.removeClass("hidden-page");
	this.menuPage.addClass("hidden-page");

	this.showNextQuizQuestion();
};

App.prototype.progressBackground = function() {
	var p = 100*this.totalCorrect/this.questions.length;
	var b = 100*(this.currentQuestion-1)/this.questions.length;
	return "linear-gradient(to right, #26A65B " + p + "%, #C0392B " + p + 
					"%, #C0392B " + b + "%, #cccccc " + b + "%)";
};

App.prototype.showNextQuizQuestion = function() {
	if (this.currentQuestion === this.questions.length) {
		this.saveQuizResults();
		this.questions= null;
		this.showMainMenu();
	} else {
		this.currentQuestion++;
		var question = this.questions[this.currentQuestion-1];
		this.showQuestion(question);
		this.currentQuestionEl.text(this.currentQuestion);
		this.progressIndicatorEl.css("background", this.progressBackground());
		this.countryInputEl.val(""); 
		//this.countryInputEl.focus(); // no good on mobile
	}
};

App.prototype.showQuestion = function(country) {
	this.correctAnswerEl.fadeOut();
	this.incorrectAnswerEl.fadeOut();

	this.nextQuestionEl.hide();
	this.countryInputsEl.show();

	this.correctAnswer = country.name;

	this.geo.showCountry(country);
};

App.prototype.checkAnswer = function() {
	if (this.countryInputEl.val().toLowerCase() === this.correctAnswer.toLowerCase()) {
		this.correctAnswerEl.fadeIn();
		this.totalCorrect++;
		this.results[this.correctAnswer] = true;
	} else {
		this.correctCountryEl.text(this.questions[this.currentQuestion-1].name);
		this.incorrectAnswerEl.fadeIn();
		this.results[this.correctAnswer] = false;
	}
	this.countryInputsEl.hide();
	this.nextQuestionEl.show();
};

queue()
    .defer(d3.json, './data/world-110m.json')
    .defer(d3.tsv, './data/world-country-names.tsv')
    .await(function(error, world, names) {
    	new App(world, names);
    });