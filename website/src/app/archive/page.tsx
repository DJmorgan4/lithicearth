'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, MapPin, Clock, Calendar, Search, Filter, Sparkles, Trophy, Target, Brain } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';
import dynamic from 'next/dynamic';

// Dynamic import for the 3D Globe to avoid SSR issues
const InteractiveGlobe = dynamic(() => import('@/components/InteractiveGlobe'), { ssr: false });

export default function ArchivePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [viewMode, setViewMode] = useState<'realtime' | 'timelapse'>('realtime');
  const [gameExpanded, setGameExpanded] = useState(false);
  
  // Daily challenge state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [hasPlayed, setHasPlayed] = useState(false);

  const dailyChallenge = {
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    questions: [
      {
        question: "What percentage of Earth's surface is covered by water?",
        options: ["61%", "71%", "81%", "91%"],
        correct: 1,
        category: "Geography"
      },
      {
        question: "Which biome stores the most carbon per square meter?",
        options: ["Rainforest", "Tundra", "Peatlands", "Grasslands"],
        correct: 2,
        category: "Ecology"
      },
      {
        question: "The Great Barrier Reef can be seen from space. True or false?",
        options: ["True", "False"],
        correct: 0,
        category: "Marine Science"
      }
    ]
  };

  const handleAnswer = (answerIndex: number) => {
    if (answerIndex === dailyChallenge.questions[currentQuestion].correct) {
      setScore(score + 1);
    }
    
    if (currentQuestion < dailyChallenge.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setHasPlayed(true);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0f0d]">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      <div className="pt-20 min-h-screen">
        {/* Header */}
        <div className="max-w-[1800px] mx-auto px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-[#5b7c6f]/10 border border-[#5b7c6f]/30 rounded-full">
              <Camera className="w-4 h-4 text-[#8b9d8a]" strokeWidth={1.5} />
              <span className="text-[#d4cfc0] text-sm font-light tracking-wide">THE ARCHIVE</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extralight text-white mb-4 tracking-tight">
              Explore Earth
              <span className="text-[#8b9d8a]"> Through Time</span>
            </h1>
            <p className="text-xl text-[#b5b0a0] font-light max-w-2xl">
              Navigate our planet through an interactive 3D globe. Watch landscapes evolve, discover hidden stories, track environmental changes.
            </p>
          </motion.div>

          {/* Controls Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-[#1a2820]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-full p-1">
              <button
                onClick={() => setViewMode('realtime')}
                className={`px-6 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === 'realtime'
                    ? 'bg-[#5b7c6f] text-white'
                    : 'text-[#b5b0a0] hover:text-white'
                }`}
              >
                Real-time
              </button>
              <button
                onClick={() => setViewMode('timelapse')}
                className={`px-6 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === 'timelapse'
                    ? 'bg-[#5b7c6f] text-white'
                    : 'text-[#b5b0a0] hover:text-white'
                }`}
              >
                Time-lapse
              </button>
            </div>

            {/* Year Slider (for timelapse) */}
            {viewMode === 'timelapse' && (
              <div className="flex items-center gap-4 bg-[#1a2820]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-full px-6 py-3">
                <Calendar className="w-4 h-4 text-[#8b9d8a]" strokeWidth={1.5} />
                <input
                  type="range"
                  min="2000"
                  max="2026"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-48 accent-[#5b7c6f]"
                />
                <span className="text-white font-light min-w-[60px]">{selectedYear}</span>
              </div>
            )}

            {/* Search */}
            <button className="flex items-center gap-2 bg-[#1a2820]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-full px-6 py-3 text-[#b5b0a0] hover:text-white hover:border-[#5b7c6f]/50 transition-all">
              <Search className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm font-light">Search location...</span>
            </button>

            {/* Filter */}
            <button className="flex items-center gap-2 bg-[#1a2820]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-full px-6 py-3 text-[#b5b0a0] hover:text-white hover:border-[#5b7c6f]/50 transition-all">
              <Filter className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm font-light">Filters</span>
            </button>
          </motion.div>
        </div>

        {/* Main Content Grid */}
        <div className="max-w-[1800px] mx-auto px-6 pb-12">
          <div className="grid lg:grid-cols-[1fr,400px] gap-6">
            {/* 3D Globe */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative h-[800px] bg-gradient-to-br from-[#1a2820]/40 to-[#0a0f0d]/40 border border-[#5b7c6f]/20 backdrop-blur-xl rounded-2xl overflow-hidden"
            >
              <InteractiveGlobe viewMode={viewMode} selectedYear={selectedYear} />
              
              {/* Globe Info Overlay */}
              <div className="absolute top-6 left-6 bg-[#0a0f0d]/80 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-xl p-4 max-w-xs">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-[#8b9d8a]" strokeWidth={1.5} />
                  <span className="text-white font-light text-sm">Interactive Controls</span>
                </div>
                <div className="space-y-2 text-xs text-[#b5b0a0] font-light">
                  <div>• <strong className="text-[#d4cfc0]">Click + Drag</strong> to rotate</div>
                  <div>• <strong className="text-[#d4cfc0]">Scroll</strong> to zoom</div>
                  <div>• <strong className="text-[#d4cfc0]">Click markers</strong> to view photos</div>
                  <div>• <strong className="text-[#d4cfc0]">Double-click</strong> location to focus</div>
                </div>
              </div>

              {/* Stats Overlay */}
              <div className="absolute bottom-6 left-6 right-6 flex gap-4">
                <div className="flex-1 bg-[#0a0f0d]/80 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-xl p-4">
                  <div className="text-3xl font-extralight text-[#8b9d8a] mb-1">0</div>
                  <div className="text-xs text-[#7a8a7d] tracking-widest uppercase font-light">Photos Archived</div>
                </div>
                <div className="flex-1 bg-[#0a0f0d]/80 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-xl p-4">
                  <div className="text-3xl font-extralight text-[#8b9d8a] mb-1">0</div>
                  <div className="text-xs text-[#7a8a7d] tracking-widest uppercase font-light">Locations</div>
                </div>
                <div className="flex-1 bg-[#0a0f0d]/80 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-xl p-4">
                  <div className="text-3xl font-extralight text-[#8b9d8a] mb-1">0</div>
                  <div className="text-xs text-[#7a8a7d] tracking-widest uppercase font-light">Contributors</div>
                </div>
              </div>
            </motion.div>

            {/* Daily Challenge Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="space-y-6"
            >
              {/* Daily Challenge Card */}
              <div className="bg-gradient-to-br from-[#1a2820]/60 to-[#0a0f0d]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-[#5b7c6f]/20">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5b7c6f] to-[#8b9d8a] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-lg font-light text-white">Daily Challenge</h3>
                      <p className="text-xs text-[#7a8a7d] font-light">{dailyChallenge.date}</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  {!hasPlayed ? (
                    <>
                      {/* Progress */}
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-[#b5b0a0] font-light">
                            Question {currentQuestion + 1} of {dailyChallenge.questions.length}
                          </span>
                          <span className="text-sm text-[#8b9d8a] font-light">
                            Score: {score}
                          </span>
                        </div>
                        <div className="h-1 bg-[#1a2820] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-[#5b7c6f] to-[#8b9d8a]"
                            initial={{ width: 0 }}
                            animate={{ width: `${((currentQuestion + 1) / dailyChallenge.questions.length) * 100}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      </div>

                      {/* Question */}
                      <div className="mb-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#5b7c6f]/10 border border-[#5b7c6f]/30 rounded-full mb-4">
                          <Brain className="w-3 h-3 text-[#8b9d8a]" strokeWidth={1.5} />
                          <span className="text-xs text-[#d4cfc0] font-light">
                            {dailyChallenge.questions[currentQuestion].category}
                          </span>
                        </div>
                        <p className="text-white font-light leading-relaxed">
                          {dailyChallenge.questions[currentQuestion].question}
                        </p>
                      </div>

                      {/* Options */}
                      <div className="space-y-3">
                        {dailyChallenge.questions[currentQuestion].options.map((option, index) => (
                          <motion.button
                            key={index}
                            onClick={() => handleAnswer(index)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full text-left p-4 bg-[#1a2820]/40 border border-[#5b7c6f]/20 hover:border-[#5b7c6f]/50 hover:bg-[#1a2820]/60 rounded-xl transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full border border-[#5b7c6f]/30 flex items-center justify-center text-xs text-[#8b9d8a] font-light">
                                {String.fromCharCode(65 + index)}
                              </div>
                              <span className="text-[#d4cfc0] font-light">{option}</span>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </>
                  ) : (
                    /* Results */
                    <div className="text-center py-8">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", duration: 0.6 }}
                        className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#5b7c6f] to-[#8b9d8a] flex items-center justify-center"
                      >
                        <Trophy className="w-10 h-10 text-white" strokeWidth={1.5} />
                      </motion.div>
                      <h4 className="text-2xl font-light text-white mb-2">Challenge Complete!</h4>
                      <p className="text-4xl font-extralight text-[#8b9d8a] mb-4">
                        {score}/{dailyChallenge.questions.length}
                      </p>
                      <p className="text-[#b5b0a0] font-light mb-6">
                        {score === dailyChallenge.questions.length 
                          ? "Perfect score! You're an Earth expert!" 
                          : score >= 2 
                          ? "Great job! Keep exploring." 
                          : "Come back tomorrow for a new challenge!"}
                      </p>
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="px-6 py-3 bg-[#5b7c6f] text-white font-light tracking-wide hover:bg-[#6b8c7f] transition-colors rounded-xl"
                      >
                        Save Your Score
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Leaderboard Preview */}
              <div className="bg-gradient-to-br from-[#1a2820]/60 to-[#0a0f0d]/60 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-[#8b9d8a]" strokeWidth={1.5} />
                  <h3 className="text-lg font-light text-white">Top Explorers</h3>
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map((rank) => (
                    <div key={rank} className="flex items-center gap-3 p-3 bg-[#1a2820]/40 rounded-xl">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-light ${
                        rank === 1 ? 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white' :
                        rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800' :
                        'bg-gradient-to-br from-orange-600 to-orange-700 text-white'
                      }`}>
                        {rank}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white font-light">Coming soon...</div>
                        <div className="text-xs text-[#7a8a7d] font-light">Join the community</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
