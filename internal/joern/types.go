package joern

type Step struct {
	Code      string `json:"code"`
	File      string `json:"file"`
	Line      int    `json:"line"`
	Method    string `json:"method"`
	IsContext bool   `json:"context,omitempty"`
}

type Flow struct {
	SinkID     string   `json:"sinkId"`
	SinkMethod string   `json:"sinkMethod"`
	SinkFile   string   `json:"sinkFile"`
	SinkLine   int      `json:"sinkLine"`
	Paths      [][]Step `json:"paths"`
}

type CallRef struct {
	Code         string `json:"code"`
	File         string `json:"file"`
	Line         int    `json:"line"`
	CallerMethod string `json:"callerMethod,omitempty"`
	CalleeMethod string `json:"calleeMethod,omitempty"`
}

type Method struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	File    string    `json:"file"`
	Line    int       `json:"line"`
	Params  []string  `json:"params"`
	Callers []CallRef `json:"callers"`
	Callees []CallRef `json:"callees"`
}

type Result struct {
	Language string   `json:"language"`
	Flows    []Flow   `json:"flows"`
	Methods  []Method `json:"methods"`
}
