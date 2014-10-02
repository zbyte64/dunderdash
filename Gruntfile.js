module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      ham: {
        src: 'dunderdash.js',
        dest: 'dunderdash.min.js'
      }
    },
    jasmine_node: {
      options: {
        forceExit: true,
        verbose: true,
        match: '.',
        matchall: false,
        extensions: 'js',
        specNameMatcher: 'spec',
        jUnit: {
          report: true,
          savePath : "./build/reports/jasmine/",
          useDotNotation: true,
          consolidate: true
        }
      },
      all: ['spec/']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-jasmine-node');

  grunt.registerTask('default', ['uglify'])
  grunt.registerTask('test', ['jasmine_node'])
}
