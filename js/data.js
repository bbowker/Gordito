class Data {
	constructor (dataAsJson, columns) {
		this.columns = columns;
		this.data = [];
		this.rows = [];

		_.each(dataAsJson, function (datum) {
			var columnData = [];
			var cleansedDatum = {};
			_.each(columns, function (column) {
				let value;
				if (column.derivativeFn) {
					// Pass columnData for previously defined columns and raw row
					value = column.derivativeFn(columnData, datum);
				} else {
					value = datum[column.orginalLabel];
					if (value) {
						if (column.type === 'boolean') {
							value = value > 0;
						} else if (column.type === 'number') {
							value = parseFloat(value);
						} else if (column.type === 'date' || column.type === 'datetime') {
							value = new Date(value);
						}
					}
				}

				columnData.push({v: value});
				cleansedDatum[column.id] = value;
			}, this);
			this.data.push(cleansedDatum);
			this.rows.push({c: columnData});
		}, this);
	}

	columnIdToIndex(columnId) {
		return _.findIndex(this.columns, function (column) {
			return column.id === columnId;
		})
	}

	dataTable() {
		return new google.visualization.DataTable({
			cols: this.columns,
			rows: this.rows
		});
	}

	dataView(columnIds) {
		var view = new google.visualization.DataView(this.dataTable());

		if (columnIds) {
			view.setColumns(_.map(columnIds, function (column) {
				if (_.isNumber(column)) {
					return this.columnIdToIndex(column);
				} else {
					if (column.sourceColumn) {
						column.sourceColumn = this.columnIdToIndex(column.sourceColumn);
					}
					return column;
				}
			}, this));
		}

		return view;
	}
}

class Excretions extends Data {
}

class Feeds extends Data {
}

class Sleeps extends Data {
	constructor (data, dayNightHour) {
		dayNightHour = dayNightHour || 8;
		console.assert(dayNightHour < 12, 'dayNightHour must be between 0 and 11');
		super(data, [
			{id: 'id', label: 'id', orginalLabel: 'id', type: 'number'},
			{id: 'start', label: 'Start Time', orginalLabel: ' Start Time', type: 'datetime'},
			{id: 'end', label: 'End Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = rawRow[' End Time'];
				if (endTime) {
					return new Date(endTime);
				} else {
					return new Date(startTime.getTime() + rawRow[" Approximate Duration (Minutes)"] * 60 * 1000);
				}
			}, type: 'datetime'},
			{id: 'midTime', label: 'Mid Time', derivativeFn: function (columnData, rawRow) {
				let startTime = columnData[1].v;
				let endTime = columnData[2].v;
				return new Date((startTime.getTime() + endTime.getTime()) / 2)
			}, type: 'datetime'},
			{id: 'note', label: 'Note', orginalLabel: ' Notes', type: 'string'},
			{id: 'duration', label: 'Duration', orginalLabel: ' Approximate Duration (Minutes)', type: 'number'},
			{id: 'type', label: 'Type', derivativeFn: function (columnData, rawRow) {
				let midTime = columnData[3].v;
				return midTime.getHours() >= dayNightHour && midTime.getHours() < dayNightHour + 12 ? 'Day Nap' : 'Night Sleep';
			}, type: 'string'},
			{id: 'day', label: 'Day', derivativeFn: function (columnData, rawRow) {
				let midTime = columnData[3].v;
				let dayAdjustment = (midTime.getHours() < dayNightHour) ? -1 : 0;
				return new Date(midTime.getFullYear(), midTime.getMonth(), midTime.getDate() + dayAdjustment);
			}, type: 'datetime'},
		]);

		this.dayNightHour = dayNightHour;
	}

	longestDurationsDataTable() {
		// Returns duration of longest n sleeps plush remainder in an array
		// Result is always an array of n+1 elements
		function longestDurations (sleeps, n) {
			let durations = _.pluck(sleeps, "duration").sort(function(a, b) {
				return b - a;
			});
			if (durations[0] < durations[1]) {
				console.log(durations, sleeps);
			}
			let longest = durations.splice(0, n);
			// Add remainder
			longest.push(_.reduce(durations, function (s, n) {
				return s+n;
			}, 0));
			// Ensure we have n + 1 results
			while (longest.length < n + 1) {
				longest.push(0);
			}
			return longest;
		}

		var dataTable = new google.visualization.DataTable();
		dataTable.addColumn({id: 'day', label: 'Day', type: 'date'});
		dataTable.addColumn({id: 'type', label: 'Type', type: 'string'});
		dataTable.addColumn({id: 'longest', label: 'Longest', type: 'number'});
		dataTable.addColumn({id: 'secondLongest', label: 'Second Longest', type: 'number'});
		dataTable.addColumn({id: 'remainder', label: 'Remainder', type: 'number'});

		_.each(this.sleepsByDay, function (sleepDay, day) {
			let napsAndSleeps = _.groupBy(sleepDay, 'type');
			_.each(['Day Nap', 'Night Sleep'], function (type) {
				let sleepDurations = longestDurations(napsAndSleeps[type], 2);
				sleepDurations.unshift(type);
				sleepDurations.unshift(new Date(day));
				dataTable.addRow(sleepDurations);
			});
		});

		return dataTable;
	}

	naps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Day Nap'}]));

		return view;
	}

	nightSleeps() {
		var view = super.dataView();
		view.setRows(view.getFilteredRows([{column: super.columnIdToIndex('type'), value: 'Night Sleep'}]));

		return view;
	}

	get sleepsByDay() {
		return _.groupBy(this.data, "day", this);
	}



}

