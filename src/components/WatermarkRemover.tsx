import { useState, useRef, useEffect } from 'react'
import { Upload, Download, Wand2, Image as ImageIcon, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { useToast } from '../hooks/use-toast'
import { blink } from '../blink/client'

interface ProcessedImage {
  original: string
  processed: string
  filename: string
}

export default function WatermarkRemover() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedImage, setProcessedImage] = useState<ProcessedImage | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Check authentication status
  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      setAuthLoading(state.isLoading)
    })
    return unsubscribe
  }, [])

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (JPG, PNG, WebP)',
        variant: 'destructive'
      })
      return
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: 'File too large',
        description: 'Please select an image smaller than 10MB',
        variant: 'destructive'
      })
      return
    }

    setSelectedImage(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setProcessedImage(null)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const processImage = async () => {
    if (!selectedImage) return

    // Check if user is authenticated
    if (!user) {
      console.error('User not authenticated:', user)
      toast({
        title: 'Authentication required',
        description: 'Please sign in to use the watermark removal feature',
        variant: 'destructive'
      })
      return
    }

    console.log('User authenticated:', { id: user.id, email: user.email })

    setIsProcessing(true)
    setProgress(0)

    try {
      // Upload the original image to storage
      toast({
        title: 'Uploading image...',
        description: 'Preparing your image for AI processing'
      })
      
      setProgress(20)
      
      const { publicUrl } = await blink.storage.upload(
        selectedImage,
        `watermark-removal/original-${Date.now()}.${selectedImage.name.split('.').pop()}`,
        { upsert: true }
      )

      console.log('Image uploaded to:', publicUrl)
      setProgress(40)

      // Use AI to analyze and remove watermark
      toast({
        title: 'AI Processing...',
        description: 'Our AI is analyzing and removing the watermark'
      })

      setProgress(60)

      // Generate a more specific prompt for watermark removal
      const analysisPrompt = `Remove all watermarks, logos, text overlays, and semi-transparent branding elements from this image. Create a clean version without any visible watermarks while maintaining the original image quality, colors, and details. Focus on completely eliminating any Getty Images watermarks, copyright notices, or other overlay text.`

      console.log('Starting AI processing with prompt:', analysisPrompt)

      const result = await blink.ai.modifyImage({
        images: [publicUrl],
        prompt: analysisPrompt,
        quality: 'high',
        n: 1
      })

      console.log('AI processing result:', result)
      setProgress(90)

      if (result && result.data && result.data[0]?.url) {
        setProcessedImage({
          original: publicUrl,
          processed: result.data[0].url,
          filename: selectedImage.name.replace(/\.[^/.]+$/, '_watermark_removed.png')
        })

        setProgress(100)
        
        toast({
          title: 'Success!',
          description: 'Watermark removed successfully',
          variant: 'default'
        })
      } else {
        console.error('Invalid AI response:', result)
        throw new Error('AI processing returned invalid response')
      }

    } catch (error) {
      console.error('Processing error:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        error: error
      })
      
      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error) {
        errorMessage = error.message
        // Check for specific error types
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
          errorMessage = 'Authentication failed. Please sign out and sign in again.'
        } else if (error.message.includes('403') || error.message.includes('forbidden')) {
          errorMessage = 'Access denied. Please check your account permissions.'
        } else if (error.message.includes('429') || error.message.includes('rate limit')) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        }
      }
      
      toast({
        title: 'Processing failed',
        description: `Error: ${errorMessage}. Please try again.`,
        variant: 'destructive'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadProcessedImage = async () => {
    if (!processedImage) return

    try {
      const response = await fetch(processedImage.processed)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = processedImage.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: 'Downloaded!',
        description: 'Your watermark-free image has been downloaded'
      })
    } catch (error) {
      toast({
        title: 'Download failed',
        description: 'Failed to download the processed image',
        variant: 'destructive'
      })
    }
  }

  const resetProcess = () => {
    setSelectedImage(null)
    setPreviewUrl('')
    setProcessedImage(null)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show sign-in prompt for unauthenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="p-3 bg-primary/10 rounded-lg w-fit mx-auto mb-4">
              <Wand2 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">AI Watermark Remover</CardTitle>
            <p className="text-muted-foreground">
              Sign in to remove watermarks from your images using advanced AI technology
            </p>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => blink.auth.login()} 
              className="w-full bg-primary hover:bg-primary/90"
            >
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">AI Watermark Remover</h1>
                <p className="text-muted-foreground">Remove watermarks from images using advanced AI technology</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Welcome, {user.email}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => blink.auth.logout()}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Upload Section */}
        {!selectedImage && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Your Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Drop your image here</h3>
                <p className="text-muted-foreground mb-4">
                  or click to browse files (JPG, PNG, WebP up to 10MB)
                </p>
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-primary hover:bg-primary/90"
                >
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Section */}
        {selectedImage && (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Original Image */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Original Image</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={resetProcess}
                    disabled={isProcessing}
                  >
                    Upload New
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                  <img 
                    src={previewUrl} 
                    alt="Original" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>File: {selectedImage.name}</p>
                  <p>Size: {(selectedImage.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </CardContent>
            </Card>

            {/* Processed Image or Processing Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : processedImage ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Watermark Removed
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-5 w-5" />
                      AI Processing
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isProcessing ? (
                  <div className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-lg font-medium mb-2">AI is working...</p>
                    <p className="text-muted-foreground text-center mb-4">
                      Analyzing and removing watermarks from your image
                    </p>
                    <div className="w-full max-w-xs">
                      <Progress value={progress} className="mb-2" />
                      <p className="text-sm text-center text-muted-foreground">{progress}% complete</p>
                    </div>
                  </div>
                ) : processedImage ? (
                  <>
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-4">
                      <img 
                        src={processedImage.processed} 
                        alt="Processed" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <Button 
                      onClick={downloadProcessedImage}
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Watermark-Free Image
                    </Button>
                  </>
                ) : (
                  <div className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center">
                    <Wand2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">Ready to Process</p>
                    <p className="text-muted-foreground text-center mb-4">
                      Click the button below to remove watermarks using AI
                    </p>
                    <Button 
                      onClick={processImage}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Remove Watermark
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Features Section */}
        {!selectedImage && (
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card>
              <CardContent className="pt-6">
                <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                  <Wand2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">AI-Powered Removal</h3>
                <p className="text-muted-foreground text-sm">
                  Advanced AI technology analyzes and removes watermarks while preserving image quality
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="p-3 bg-accent/10 rounded-lg w-fit mb-4">
                  <ImageIcon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="font-semibold mb-2">High Quality Output</h3>
                <p className="text-muted-foreground text-sm">
                  Maintains original image resolution and quality while seamlessly removing watermarks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="p-3 bg-green-500/10 rounded-lg w-fit mb-4">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="font-semibold mb-2">Fast Processing</h3>
                <p className="text-muted-foreground text-sm">
                  Quick and efficient watermark removal with real-time progress tracking
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}