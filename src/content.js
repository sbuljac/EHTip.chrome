module("content", function( exports, require ) {
	
var shapes = require("shapes"),
	common = require("common"),
	reNotWord = common.reNotWord,
	reWordJoiner = common.reWordJoiner,
	cleanTerm = common.cleanTerm;

	
var	window = this,
	document = window.document,
	_options = {
		"tooltip.onStay": 0,
		"tooltip.onSelect": 0
	},
	_tooltip,
	_rect = null,
	_boxOutliner = null,
	_stayMode,
	_selectMode,
	_stayDelays,
	_noTooltipArrow,
	_hold,
	_explicit,
	_ignoreNextMouseUp,
	_event = {
		clientX: null,
		clientY: null,
		target: null,
		button: null,
		ctrlKey: null,
		metaKey: null
	},
	_bevent = {
		target: null
	}
	undefined;


chrome.extension.sendRequest( { type: "getOptions" }, handleOptions );

chrome.extension.onRequest.addListener(function( req, sender, send ) {
	switch ( req.type ) {
		case "options":
			handleOptions( req.options );
			send();
			break;
		
		default:
			send();
	}
});

function isExplicitEvent( event ) {
	return !!( event.ctrlKey || event.metaKey );
}


function handleOptions( options ) {
	ABORT();
	
	if ( options["tooltip.enabled"] ) {
		_tooltip = _tooltip || new shapes.Tooltip( document );
	} else {
		options["tooltip.onStay"] = 0;
		options["tooltip.onSelect"] = 0;
	}
	
	for ( var name in options ) {
		if ( _options[name] === options[name] ) {
			continue;
		}
		
		var oldValue = _options[ name ];
		var newValue = options[ name ];
		
		switch ( name ) {
			case "tooltip.onStay":
				_boxOutliner = newValue ?
					new shapes.BoxOutliner( document, "1px dashed red" ) :
					null;
				
				_stayMode = newValue;
				applyListiners( window, newValue, hoverListiners );
				break;
			
			case "tooltip.onStay.delays":
				_stayDelays = newValue;
				break;
				
			case "tooltip.onSelect":
				_selectMode = newValue;
				applyListiners( window, newValue, selectListiners );
				break;
				
		}
	}
	
	_options = options;
}

function lookup( term, callback ) {
	reqProcess.send(
		{
			type: "lookup",
			term: term,
			limit: !_explicit ? _options["tooltip.limit"] : 0,
			dicts: _explicit ? null : _options.implicit_dicts,
			stopOnExact: !_explicit,
			localize: true
		},
		callback || handleLookupResponse
	);
}

function handleLookupResponse( res ) {
	if ( res && res.length ) {
		putResultsInTooltip( res );
		_tooltip.show( _rect, _options["tooltip.preferedPosition"], _noTooltipArrow );
		
		if ( _hold ) {
			applyListiners( window, true, holdListiners );
		}
		
	} else {
		_hold = false;
	}
	
	//_explicit = undefined;
	_noTooltipArrow = false;
}

function putResultsInTooltip( results ) {
	var span, t, b, dictNameDiv, not_exact,
		w = _tooltip.createElement('div');
	
	if ( _hold ) {
		span = _tooltip.createElement('span');
		span.style.cursor = "pointer";
		span.style.color = "blue";
		applyListiners( _tooltip._content, true, tooltipListiners );
	}
	
	if ( _explicit ) {
		dictNameDiv = _tooltip.createElement('div');
		dictNameDiv.style.fontSize = "0.8em";
		dictNameDiv.style.color = "#6D6D67";
	}
	
	for ( var i = 0, l = results.length; i < l; ++i ) {
		if ( i !== 0 ) {
			w.appendChild( _tooltip._sep_.cloneNode(false) );
		}
		
		not_exact = results[i].exact === false;
		
		b = _tooltip._b_.cloneNode(false);
		b.textContent = results[i].term || results[i].message;
		
		if ( not_exact ) {
			w.appendChild( document.createTextNode('(') );
		}
		
		w.appendChild( b );
		
		if ( not_exact ) {
			w.appendChild( document.createTextNode(')') );
		}
		
		if ( results[i].definitions ) {
			if ( _hold ) {
				w.appendChild( document.createTextNode(': ') );
				var defs = results[i].definitions;
				for ( var j = 0, n = defs.length; j < n; ++j ) {
					if ( j !== 0 ) {
						w.appendChild( document.createTextNode(', ') );
					}
					t = span.cloneNode(false);
					t.textContent = defs[j];
					w.appendChild( t );
				}
			} else {
				t = ': ' + results[i].definitions.join(', ');
				w.appendChild( document.createTextNode( t ) );
			}
		}
		
		if ( dictNameDiv ) {
			t = dictNameDiv.cloneNode(false);
			t.textContent = results[i].dict_localized;
			w.appendChild( t );
		}
	}
	
	_tooltip.setContent( w );
}

function abort() {
	if ( _hold ) {
		return;
	}
	
	//if ( _stayTimeoutId ) {
	//	window.clearTimeout( _stayTimeoutId );
	//	_stayTimeoutId = null;
	//}
	
	_rect = null;
	_hold = false;
	_explicit = undefined;
	_noTooltipArrow = false;
	reqProcess.abort();
	shrinkAnimation && shrinkAnimation.stop();
	
	// save memory
	_event.target = null;
	
	if ( _tooltip && _tooltip.visible ) {
		_tooltip.hide();
	}
	
	if ( _boxOutliner && _boxOutliner.visible ) {
		_boxOutliner.hide();
	}
}

function ABORT() {
	if ( _hold ) {
		applyListiners( window, false, holdListiners );
		_hold = false;
		_bevent.target = null;
	}
	abort();
	mouseStay.abort();
}

function applyListiners( target, add, map ) {
	var action = add ? 'addEventListener' : 'removeEventListener';
	for ( var type in map ) {
		target[ action ]( type, map[type], true );
	}
}

function isEventInTooltip( event ) {
	return _hold && _tooltip && _tooltip.$box.contains( event.target );
}

var holdListiners = {
"keyup": function( event ) {
	if ( event.keyCode !== 17 && event.keyCode !== 224 ) {
		ABORT();
	}
}
};


var hoverListiners = {
"scroll": abort,
"mousemove": function( event ) {
	if ( _rect && (_explicit || !isExplicitEvent(event)) && isRectOverPoint(_rect, event.clientX, event.clientY)
		|| isEventInTooltip(event) ) {
		return;
	}
	
	abort();
	
	var explicit = isExplicitEvent( event );
	
	if ( explicit || !_hold && _stayMode > 1 ) {
		recObject( _event, event );
		_explicit = explicit;
		mouseStay.delay = _stayDelays[ explicit ? 0 : 1 ];
		mouseStay();
	} else {
		mouseStay.abort();
	}
}
};

var mouseStay = debounce(function() {
	if ( _event.target && !isEditable(_event.target) ) {
		var range = getRangeAtXY( _event.target, _event.clientX, _event.clientY );
		if ( !range ) return;
		
		var node = range.startContainer;
		var str = node.textContent;
		var offset = range.startOffset;
		var a, b, aj, bj, boxRect, rect;
		var term, leftWord, rightWord;
		
		var overChar = !reNotWord.test( str[offset] );
		
		if ( overChar ) {
			a = wordBound( str, offset, -1 );
			b = wordBound( str, offset, 1 );
			
			range.setStart( node, a );
			range.setEnd( node, b );
			
			term = range.toString();
			//term = str.substring( a, b );
		} else {
			a = range.startOffset;
			b = range.endOffset;	
		}
		
		if ( overChar ) {
			rect = range.getBoundingClientRect();
		}
		
		aj = passLeftWordJoiner( str, a );
		bj = passRightWordJoiner( str, b );
		
		if ( !overChar ) {
			rect = range.getBoundingClientRect();
		}
		
		if ( aj !== -1 ) {
			a = wordBound( str, aj, -1 );
			leftWord = str.substring( a, aj );
		}
		
		if ( bj !== -1 ) {
			b = wordBound( str, bj, 1 );
			rightWord = str.substring( bj, b );
		}
		
		if ( overChar ) {
			boxRect = rect;
			
			if ( leftWord || rightWord ) {
				term = trisCombinations( leftWord, term, rightWord );
			}
			
		} else if ( leftWord && rightWord ) {
			range.setStart( node, a );
			range.setEnd( node, b );
			boxRect = range.getBoundingClientRect();
			
			term = leftWord + ' ' + rightWord;
			
		}
		
		range.detach();
		
		if ( term ) {
			
			//ABORT();
			
			_rect = rect;
			_hold = false;
			_explicit && _boxOutliner.show( boxRect );
			shrinkAnimation && shrinkAnimation.play();
			//console.log( term );
			lookup( term );
		}
	}
});


var selectListiners = {
"mousedown": function( event ) {
	if ( !isEventInTooltip(event) ) {
		_hold && ABORT();
		recObject( _bevent, event );
	}
},
"mouseup": function( event ) {
	if ( _ignoreNextMouseUp ) {
		event.preventDefault();
		event.stopPropagation();
		_ignoreNextMouseUp = false;
		return;
	}
	if ( event.button === 0 && (_selectMode > 1 || isExplicitEvent(event)) ) {
		recObject( _event, event );
		window.setTimeout( onSelected, 1 );
	}
}
};

function onSelected() {
	var node = _bevent.target;
	var selection = getSelectionFrom( node );
	var selected = selection.toString();
	if ( selected && selected.length < 50 ) {
		ABORT();
		if ( isInputElement(node) || node.contentDocument ) {
			_rect = new PointRect( _event.clientX, _event.clientY, 10 );
			_noTooltipArrow = true;
		} else {
			var range = selection.getRangeAt(0);
			_rect = range.getBoundingClientRect();
			range.detach();
		}
		_hold = true;
		_explicit = true;
		lookup( selected );
	}
}

var tooltipListiners = {
"mouseout": function( event ) {
	if ( event.target.tagName.toLowerCase() === "span" ) {
		event.target.style.textDecoration = "none";
	}
	if ( event.relatedTarget.tagName.toLowerCase() === "span" ) {
		event.relatedTarget.style.textDecoration = "underline";
	}
},
"mousedown": function( event ) {
	event.preventDefault();
	event.stopPropagation();
	_ignoreNextMouseUp = true;
	var name = event.target.tagName.toLowerCase();
	if ( name === "b" || name === "span" ) {
		if ( event.button === 1 || isExplicitEvent(event) ) {
			_noTooltipArrow = true;
			_hold = true;
			_explicit = true;
			lookup( event.target.textContent );
		
		} else {
			setSelection( cleanTerm(event.target.textContent) );
			ABORT();
		}
	}
}
};

function getSelectionFrom( node ) {
	return node.contentDocument ?
		node.contentDocument.getSelection() :
		node.ownerDocument.getSelection();
}

function setSelection( text ) {
	var node = _bevent.target,
		selection = getSelectionFrom( node ),
		selected = selection.toString(),
		a, b, t, spaceLeft, spaceRight, value;
	
	if ( !selected ) {
		return;
	}
	
	spaceLeft = selected.match(/^(\s*)/)[1];
	spaceRight = selected.match(/(\s*)$/)[1];
	selected = selected.slice( spaceLeft.length, -spaceRight.length || selected.length );
	text = spaceLeft + toSameCaseAs( text, selected ) + spaceRight;
	
	if ( !isInputElement(node) ) {
		node = selection.anchorNode;
		value = node.textContent;
		a = b = selection.anchorOffset;
		if ( node === selection.focusNode ) {
			b = selection.focusOffset;
			if ( b < a ) {
				t = a;
				a = b;
				b = t;
			}
		}
		node.textContent = value.substring(0, a) + text + value.substring(b);
		selection.collapse( node, a + text.length );
		try {
			node.focus();
		} catch (e) {}
		
	} else {
		value = node.value;
		a = node.selectionStart;
		b = node.selectionEnd;
		var scrollTop = node.scrollTop;
		var scrollLeft = node.scrollLeft;
		node.value = value.substring(0, a) + text + value.substring(b);
		node.selectionStart = node.selectionEnd = ( a + text.length );
		node.focus();
		node.scrollTop = scrollTop;
		node.scrollLeft = scrollLeft;
	}
}

function toSameCaseAs( str, sample ) {
	if ( sample.toLowerCase() === sample ) {
		return str;
	}
	if ( sample.toUpperCase() === sample && sample.length > 1 ) {
		return str.toUpperCase();
	}
	if ( sample[0].toUpperCase() === sample[0] ) {
		return str[0].toUpperCase() + str.substr(1);
	}
	return str;
}

function isInputElement( elem ) {
	var name = elem.nodeName.toLowerCase();
	return ( name === "input" || name === "textarea" );
}


function isEditable( elem ) {
	if ( isInputElement(elem) ) {
		return true;
	}
	
	if ( document.designMode && document.designMode.toLowerCase() == "on" ) {
		return true;
	}
	
	while ( elem ) {
		if ( elem.isContentEditable ) {
			return true;
		}
		elem = elem.parentNode;
	}
	
	return false;
}

function recObject( dst, src ) {
	for ( var prop in dst ) {
		dst[ prop ] = src[ prop ];
	}
}

var reqProcess = (function(){
	var aborted = false, uid = 0;
	
	return {
		send: function( obj, callback, that ) {
			var id = ++uid;
			aborted = false;
			
			chrome.extension.sendRequest( obj, function() {
				if ( !aborted && id === uid ) {
					callback.apply( that, arguments );
				}
			});
		},
		
		abort: function() {
			aborted = true;
		}
	};
})();


function getRangeAtXY( parent, x, y ) {
	var range = document.createRange(),
		childs = parent.childNodes;
	
	for ( var i = 0, l = childs.length; i < l; ++i ) {	
		if ( childs[i].nodeType !== 3 ) {
			continue;
		}
		
		if ( shrinkRangeToXY( range, x, y, childs[i] ) ) {
			return range;
		}
	}
	
	range.detach();
	return null;
}

var shrinkAnimation = 0 && (function(){
	var	a = [], i = -1, interval_id,
		outliner = new shapes.BoxOutliner( document, "2px dotted orange" );
	
	function step(x) {
		if ( x ) {
			x[1] && outliner.setBorderStyle( x[1] );
			outliner.show( x[0] || x );
		}
		return x && x[2];
	}
	
	a.play = function() {
		if ( interval_id || !a[i+1] ) {
			return;
		}
		interval_id = window.setInterval(function() {
			if ( step( a[++i] ) || !a[i+1] ) {
				a.stop(1);
			}
		}, 200);
	}
	
	a.stop = function( pause ) {
		if ( interval_id ) {
			window.clearInterval( interval_id );
			interval_id = null;
		}
		if ( !pause ) {
			a.length = 0;
			i = -1;
			outliner.hide();
		}
	};
	
	window.addEventListener('keydown', function(e) {
		var c = e.keyCode;
		
		if ( c === 17 ) {
			a.play();
			return;
		}
		
		interval_id && a.stop(1);
		
		if ( c === 39 && a[i+1] ) {
			step( a[++i] );
		}
		
		if ( c === 37 && a[i-1] ) {
			step( a[--i] );
		}
	}, false);
	
	return a;
})();

// D&C
function shrinkRangeToXY( range, x, y, node, /* internals */ a, b ) {
	if ( a === undefined ) {
		range.selectNodeContents( node );
		a = range.startOffset;
		b = range.endOffset;
		
	} else {
		range.setStart( node, a );
		range.setEnd( node, b );
	}
	
	if ( a === b ) {
		return false;
	}
	
	var r = range.getBoundingClientRect();
	if ( r.left > x || r.right < x || r.top > y || r.bottom < y ) {
		shrinkAnimation && shrinkAnimation.push([r, "3px dotted red"]);
		return false;
	}
	
	shrinkAnimation && shrinkAnimation.push([r, "2px dotted green"]);
	
	var d = b - a;
	if ( d === 1 ) {
		return true;
	}
	
	var pivot = Math.floor( d / 2 ) + a;
	
	return shrinkRangeToXY( range, x, y, node, a, pivot )
		|| shrinkRangeToXY( range, x, y, node, pivot, b );
}


function isRectOverPoint( r, x, y ) {
	return !( r.left > x || r.right < x || r.top > y || r.bottom < y );
}

function MovedRect( r, x, y ) {
	this.top = r.top + y;
	this.right = r.right + x;
	this.bottom = r.bottom + y;
	this.right = r.right + x;
	this.height = r.height;
	this.width = r.width;
}

function PointRect( x, y, r ) {
	this.left = x - r;
	this.right = x + r;
	this.top = y - r;
	this.bottom = y + r;
	this.height = r + r;
	this.width = r + r;
}

//var globalizedRect = (function(){
//	
//	function proc( doc, frame, p ) {
//		var ok;
//		
//		if ( doc === frame.ownerDocument ) {
//			ok = true;
//			
//		} else {
//			var frames = doc.querySelectorAll('frame, iframe');
//			for ( var i = 0, l = frames.length; !ok && i < l; ++i ) {
//				var contentDoc = frames.contentDocument;
//				if ( contentDoc && proc(contentDoc, frame, p) ) {
//					ok = true;
//				}
//			}
//		}
//		
//		if ( ok ) {
//			p.x += frame.offsetLeft - doc.body.scrollLeft;
//			p.y += frame.offsetTop - doc.body.scrollTop;
//		}
//		
//		return ok;
//	}
//	
//	return function( rect, frame ) {
//		var p = { x: 0, y: 0 };
//		proc( document, frame, p );
//		return new MovedRect( rect, p.x, p.y );
//	};
//	
//})();

function wordBound( str, p, inc ) {
	var	oldp = p,
		c = str[p],
		pc = charCase(c), cc,
		nc = ( inc < 0 ? -1 : 1 ),
		next = ( inc < 0 ? inc : inc - 1 );
	
	for ( ; ; p += inc ) {
		c = str[ p + next ];
		if ( !c || reNotWord.test(c) ) break;
		cc = charCase( c );
		if ( pc === -cc && cc === nc ) break;
		pc = cc;
	}
	
	if ( p !== oldp ) {
		if ( inc > 0 && str[p-1] === "'" || str[p] === "'" ) {
			p -= inc;
		}
	}
	
	return p;
}

function passLeftWordJoiner( str, p ) {
	for ( ; p > 0; --p ) {
		if ( !reWordJoiner.test( str[p-1] ) ) {
			return p;
		}
	}
	return -1;
}

function passRightWordJoiner( str, p ) {
	for ( var n = str.length; p < n; ++p ) {
		if ( !reWordJoiner.test( str[p] ) ) {
			return p;
		}
	}
	return -1;
}

function charCase( c ) {
	var upper = c.toUpperCase();
	var lower = c.toLowerCase();
	return upper === lower ? 0 :
		c === upper ? 1 : -1;
}

function trisCombinations( a, b, c ) {
	var rv = [];
	
	if ( c && b.indexOf("'") === -1 ) {
		rv.push( b + ' ' + c );
	}
	
	if ( a && a.indexOf("'") === -1 ) {
		rv.push( a + ' ' + b );
	}
	
	rv.push( b );
	
	return rv;
}

// https://gist.github.com/789582
function debounce( callback, delay ) {
	var timer_id, end_time, that, args, undef,
		now = Date.now || function(){ return +new Date(); };
	
	function onTimeout() {
		var delta = end_time - now();
		
		if ( delta > 0 ) {
			timer_id = setTimeout( onTimeout, delta );
		
		} else {
			var t = that, a = args;
			timer_id = that = args = undef;
			proxy.callback.apply( t, a );
		}
	}
	
	var proxy = function() {
		var t = end_time;
		
		end_time = now() + proxy.delay;
		that = this;
		args = arguments;
		
		if ( !timer_id || end_time < t ) {
			timer_id && clearTimeout( timer_id );
			timer_id = setTimeout( onTimeout, proxy.delay );
		}
	};
	
	proxy.delay = delay;
	proxy.callback = callback;
	
	proxy.abort = function() {
		if ( timer_id ) {
			clearTimeout( timer_id );
			timer_id = that = args = undef;
		}
	};
	
	return proxy;
}

});
