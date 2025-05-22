// _config.js
// Các biến này được Flask truyền vào khi render template
const criteriaLabels = {{ criteria | tojson }};
const brandLabels = {{ brands | tojson }};