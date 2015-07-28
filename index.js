'use strict';

var RSVP = require('rsvp'),
	_ = require("underscore");

exports.prepare = function(req) {
	return new RSVP.Promise(function(resolve, reject) {
		var infos = {
			maxResultPossible : req.maxResultPossible,
			range : req.query.range,
			count : 0,
			fields : req.query.fields,
			links : {},
			result : undefined,
			filters : req.query,
			sort : req.query.sort,
			desc : req.query.desc
		}
		resolve(infos);
	});
}

exports.sort = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {	
		var sorts = infos.sort;
		var desc = infos.desc;
		if (!_.isUndefined(sorts)) {
			if (!_.isUndefined(desc)) {
				infos.sort = _.map(sorts.split(','), function(sort) {													
					if (_.contains(desc.split(','), sort)) {						
						sort = '-' + sort;
					}
					return sort;
				});				
			}
			else {
				infos.sort = sorts.split(',');
			}
		}
		
		resolve(infos);
	});	
}

exports.filters = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {	
		var filtersResult = {};
		var filters = infos.filters;
		if (!_.isUndefined(filters)) {
			_.mapObject(filters, function(val, key) {
				if (!_.contains(['range', 'fields', 'sort', 'desc'], key)) {
					filtersResult[key] = _.map(val.split(','), 
						function(item) { 
							if (item.indexOf('*') > -1) {
								return  new RegExp(item.replace('*', '.*'), "i"); 
							}
							else {
								return item;
							}
							
						});
				}
			});
		}
		infos.filters = filtersResult;
		resolve(infos);
	});	
}

exports.range = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {	
		var rangeArray = undefined;
		if (_.isUndefined(infos.range)) {
			rangeArray = [0,infos.maxResultPossible];
		}
		else {		
			rangeArray = infos.range.split('-');
		}

		if (rangeArray[1] > infos.maxResultPossible) {
			reject({
				status : 400,
				reason : 'Requested range not allowed'
			});
		}
		infos.range = {
			offset : rangeArray[0],
			limit : rangeArray[1],
		}
		resolve(infos);
	});
}


exports.addFilters = function(mongoReq, filters) {
	_.mapObject(filters, function(val, key) {
		mongoReq = mongoReq.where(key).in(val);
	});
	return mongoReq;
}

exports.addSort = function(mongoReq, sorts) {
	_.each(sorts, function(sort) {
		mongoReq = mongoReq.sort(sort);
	});
	return mongoReq;
}

exports.addRange = function(mongoReq, range) {	
		return mongoReq.skip(range.offset).limit(range.limit - range.offset);
}



function calcFirstLink(range) {
	var nbPage = range.limit - range.offset;
	return '0-'+ nbPage;
}

function calcLastLink(range, count) {
	var nbPage = range.limit - range.offset;
	var beginEnd = count - nbPage;
	return beginEnd + '-' + count;
}

function calcPrevLink(range) {
	var nbPage = range.limit - range.offset;
	
	var endPrev = range.offset -1;
	if (endPrev <= 0) endPrev = range.limit;

	var beginPrev = endPrev - nbPage;
	if (beginPrev < 0) beginPrev = 0;

	return beginPrev + '-' + endPrev;
}

function calcNextLink(range, count) {
	var nbPage = range.limit - range.offset;
	var limit = parseInt(range.limit);
	var beginNext = limit + 1;
	if (beginNext > count) beginNext = count;
	var endNext = beginNext + nbPage;
	if (endNext > count) endNext = count;

	return beginNext + '-' + endNext;
}


exports.links = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {		
		var range = infos.range;
		if (!_.isUndefined(range) && !_.isUndefined(range.offset) && !_.isUndefined(range.limit)) {
			var first = calcFirstLink(range);
			var prev = calcPrevLink(range);
			var next = calcNextLink(range, infos.count);
			var last = calcLastLink(range, infos.count);
			infos.links = {
				first : 'range=' + first,
				prev : 'range=' + prev,
				next : 'range=' + next,
				last : 'range=' + last
			}
		}
		resolve(infos);
	})
}

exports.fields = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {	
		var rangeFields = undefined;
		if (!_.isUndefined(infos.fields)) {				
			rangeFields = infos.fields.split(',');
			rangeFields = _.map(rangeFields, function(field) {
				var newField = field;				
				if (field.indexOf('(') > -1 && field.indexOf(')') > -1) {
					var regExp = /(.*)\((.*)\)/g;
					var tabRegExp = regExp.exec(field);
					var nameField = tabRegExp[1];
					var tabUnderField = tabRegExp[2].split(';');
					newField = {};
					newField[nameField] = tabUnderField;					
				}
				return newField;
			});
		}
		infos.fields = rangeFields;		
		resolve(infos);
	});
}

exports.format = function(infos) {
	return new RSVP.Promise(function(resolve, reject) {
		if (!_.isUndefined(infos.result) && !_.isUndefined(infos.fields)) {			
			infos.result = _.map(infos.result, function(magasin) {
				var magResult = {};
				_.each(infos.fields, function(field) {
					if (_.isObject(field)) {
						_.mapObject(field, function(vals, key) {
							if (!_.isUndefined(magasin[key])) {								
								if (_.isArray(vals)) {									
									_.each(vals, function(val) {										
										if (!_.isUndefined(magasin[key][val])) {
											if (_.isUndefined(magResult[key]))  {
												magResult[key] = {};
											}
											magResult[key][val] = magasin[key][val];
										}
									});
								}								
							}
						  
						});						
					}
					else {
						if (!_.isUndefined(magasin[field])) {
							magResult[field] = magasin[field];
						}
					}
					
				});
				return magResult;
			})
		}
		resolve(infos);
	});
}
